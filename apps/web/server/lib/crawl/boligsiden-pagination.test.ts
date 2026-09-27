import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBoligsidenListings } from "./boligsiden.js";
import { fetchJson } from "./http.js";

vi.mock("./http.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./http.js")>(), fetchJson: vi.fn(), sleep: vi.fn().mockResolvedValue(undefined),
}));

const record = (id: number, zipCode = 9000) => ({
  caseID: `case-${id}`, priceCash: 2_500_000, housingArea: 95,
  coordinates: { lat: 57.05, lon: 9.92 },
  address: { roadName: "Testvej", houseNumber: String(id), zipCode, municipality: { name: "Aalborg" } },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRAWL_MOCK_MODE", "false");
  vi.stubEnv("CRAWL_ZIP_RANGES", "9000-9000");
  vi.stubEnv("CRAWL_PAGE_SIZE", "100");
  vi.stubEnv("CRAWL_MAX_PAGES", "1000");
  vi.stubEnv("CRAWL_MAX_LISTINGS", "50000");
});
afterEach(() => vi.unstubAllEnvs());

describe("Boligsiden weekly coverage", () => {
  it("fetches past 100 pages and the former 5,000-record cap so older listings refresh", async () => {
    vi.stubEnv("CRAWL_PAGE_SIZE", "50");
    vi.mocked(fetchJson).mockImplementation(async (url) => {
      const page = Number(new URL(url).searchParams.get("page"));
      const start = (page - 1) * 50;
      return { totalHits: 5001, cases: Array.from({ length: Math.min(50, 5001 - start) }, (_, index) => record(start + index)) };
    });
    const { listings, stats } = await fetchBoligsidenListings();
    expect(listings).toHaveLength(5001);
    expect(listings.at(-1)?.external_id).toBe("case-5000");
    expect(stats).toMatchObject({ complete: true, pagesFetched: 101, recordsSeen: 5001 });
  });

  it("does not claim completion using requested page size when the provider returns fewer records", async () => {
    vi.mocked(fetchJson)
      .mockResolvedValueOnce({ totalHits: 3, cases: [record(1), record(2)] })
      .mockResolvedValueOnce({ totalHits: 3, cases: [record(3)] });
    const { listings, stats } = await fetchBoligsidenListings();
    expect(listings).toHaveLength(3);
    expect(stats.complete).toBe(true);
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it("retains the whole configured postcode scope instead of sending only its first 300 codes", async () => {
    vi.stubEnv("CRAWL_ZIP_RANGES", "9000-9900");
    vi.mocked(fetchJson).mockResolvedValue({ totalHits: 3, cases: [record(1, 9000), record(2, 9900), record(3, 1000)] });
    const { listings, stats } = await fetchBoligsidenListings();
    expect(new URL(vi.mocked(fetchJson).mock.calls[0]![0]).searchParams.getAll("zipCodes")).toEqual([]);
    expect(listings.map((listing) => listing.postal_code)).toEqual(["9000", "9900"]);
    expect(stats).toMatchObject({ complete: true, recordsOutOfArea: 1 });
  });

  it("narrows a small postcode scope without dropping its final code", async () => {
    vi.stubEnv("CRAWL_ZIP_RANGES", "9000-9299");
    vi.mocked(fetchJson).mockResolvedValue({ cases: [] });
    await fetchBoligsidenListings();
    const codes = new URL(vi.mocked(fetchJson).mock.calls[0]![0]).searchParams.getAll("zipCodes");
    expect(codes).toHaveLength(300);
    expect(codes.at(-1)).toBe("9299");
  });

  it("ignores unmappable out-of-area plots before validating the in-scope listing feed", async () => {
    vi.stubEnv("CRAWL_ZIP_RANGES", "9000-9900");
    vi.mocked(fetchJson).mockResolvedValue({ totalHits: 3, cases: [
      { ...record(1, 1000), housingArea: 0 },
      { caseID: "out-of-area", address: { zip: { zipCode: 8000 } } },
      record(3, 9900),
    ] });
    const { listings, stats } = await fetchBoligsidenListings();
    expect(listings.map((listing) => listing.external_id)).toEqual(["case-3"]);
    expect(stats).toMatchObject({ complete: true, recordsSeen: 3, recordsOutOfArea: 2, recordsSkipped: 0 });
    expect(stats.mappingWarnings).toEqual([]);
  });

  it.each([
    { zipCode: undefined },
    { zipCode: 0 },
    { zipCode: 1000.5 },
    { zipCode: "unknown" },
    { zipCode: 1000, zip: { zipCode: 9000 } },
  ])("keeps uncertain source geography incomplete instead of assuming it is out of area: %j", async (zip) => {
    const candidate = record(1);
    vi.mocked(fetchJson).mockResolvedValue({ totalHits: 1, cases: [{ ...candidate, address: { ...candidate.address, ...zip } }] });
    const { listings, stats } = await fetchBoligsidenListings();
    expect(listings).toEqual([]);
    expect(stats).toMatchObject({ complete: false, recordsSeen: 1, recordsOutOfArea: 0, recordsSkipped: 1 });
    expect(stats.mappingWarnings).toEqual(["page 1: skipped record with unknown or conflicting postcode"]);
  });

  it.each([true, false])("detects repeated entirely out-of-area pages, including records without source IDs (has ID: %s)", async (hasId) => {
    const excluded = [{ housingArea: 0, address: { zipCode: 1000 } }, { housingArea: 0, address: { zipCode: 2000 } }]
      .map((value, index) => hasId ? { ...value, caseID: `outside-${index}` } : value);
    vi.mocked(fetchJson).mockResolvedValue({ totalHits: 4, cases: excluded });
    const { listings, stats } = await fetchBoligsidenListings();
    expect(listings).toEqual([]);
    expect(stats).toMatchObject({ complete: false, recordsSeen: 4, recordsOutOfArea: 4, recordsSkipped: 0 });
    expect(stats.errors).toEqual(["page 2: no new listing identities; pagination did not advance"]);
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it("counts out-of-area and invalid records against the raw-record cap", async () => {
    vi.stubEnv("CRAWL_MAX_LISTINGS", "2");
    vi.mocked(fetchJson).mockResolvedValue({ totalHits: 3, cases: [
      { ...record(1, 1000), housingArea: 0 },
      { ...record(2), housingArea: 0 },
      record(3),
    ] });
    const { listings, stats } = await fetchBoligsidenListings();
    expect(listings).toEqual([]);
    expect(stats).toMatchObject({ complete: false, recordsSeen: 2, recordsOutOfArea: 1, recordsSkipped: 1 });
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it.each(["CRAWL_MAX_PAGES", "CRAWL_MAX_LISTINGS"])("reports incomplete coverage at the %s bound", async (cap) => {
    vi.stubEnv(cap, "1");
    vi.mocked(fetchJson).mockResolvedValue({ totalHits: 3, cases: [record(1), record(2)] });
    const { stats } = await fetchBoligsidenListings();
    expect(stats.complete).toBe(false);
  });

  it("rejects repeated pages and deduplicates records without false full coverage", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ totalHits: 4, cases: [record(1), record(2)] });
    const { listings, stats } = await fetchBoligsidenListings();
    expect(listings).toHaveLength(2);
    expect(stats.complete).toBe(false);
    expect(stats.errors).toEqual(["page 2: no new listing identities; pagination did not advance"]);
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it("fails when an empty page arrives before the source-reported total", async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ totalHits: 3, cases: [record(1)] }).mockResolvedValueOnce({ totalHits: 3, cases: [] });
    const { stats } = await fetchBoligsidenListings();
    expect(stats.complete).toBe(false);
    expect(stats.errors).toEqual(["page 2: empty page before the reported feed total"]);
  });

  it("requires an empty terminal page when the provider omits a total", async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ cases: [record(1)] }).mockResolvedValueOnce({ cases: [record(2)] }).mockResolvedValueOnce({ cases: [] });
    const { listings, stats } = await fetchBoligsidenListings();
    expect(listings).toHaveLength(2);
    expect(stats).toMatchObject({ complete: true, pagesFetched: 3 });
  });
});

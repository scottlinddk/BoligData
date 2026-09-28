import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "./crawl/http.js";
import { mapBoligsidenDetails } from "./boligsiden-listing-details.js";

vi.mock("./crawl/http.js", async importOriginal => ({ ...await importOriginal<typeof import("./crawl/http.js")>(), fetchJson: vi.fn() }));

const CASE_ID = "8429dc34-2a49-41f8-8589-79092bb6e2e3";
const ADDRESS_ID = "0a3f50ca-b515-32b8-e044-0003ba298018";
const NEIGHBOUR_ID = "c7c83632-34a3-48e6-b192-d50ad21f21a2";
const NOW = "2026-09-28T14:00:00.000Z";
const location = { lat: 57.033722, lon: 9.9164, postalCode: "9000" };
// Field shape checked against the live Skytten 1A search result. Broker prose
// is shortened here; the mapper preserves the complete supplied body.
const listing = () => ({
  caseID: CASE_ID, slugAddress: "skytten-1a-3-th-9000-aalborg", housingArea: 43,
  descriptionTitle: "Lejlighed med vestvendt altan og kig mod byen",
  descriptionBody: "En lys bolig med vestvendt altan.\nBoligen ligger på tredje sal.",
  address: { addressID: ADDRESS_ID, buildings: [{ housingArea: 43, yearBuilt: 1937, numberOfFloors: 3, roofingMaterial: "Fibercement herunder asbest", externalWallMaterial: "Mursten" }] },
});

beforeEach(() => { vi.resetModules(); vi.mocked(fetchJson).mockReset(); vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());
async function resolver() { return (await import("./boligsiden-listing-details.js")).fetchBoligsidenDetails; }

describe("Boligsiden listing details mapping", () => {
  it("preserves the separate broker title, body and source building facts", () => {
    expect(mapBoligsidenDetails(listing(), CASE_ID)).toMatchObject({
      source: "boligsiden", sourceUrl: "https://www.boligsiden.dk/adresse/skytten-1a-3-th-9000-aalborg",
      title: listing().descriptionTitle, description: listing().descriptionBody, fetchedAt: NOW,
      facts: { yearBuilt: 1937, floors: 3, roofMaterial: "Fibercement herunder asbest", wallMaterial: "Mursten" },
    });
  });

  it("does not present a neighbour's body or a malformed response", () => {
    expect(mapBoligsidenDetails(listing(), NEIGHBOUR_ID)).toBeNull();
    expect(mapBoligsidenDetails(null, CASE_ID)).toBeNull();
    expect(mapBoligsidenDetails({ ...listing(), caseID: undefined }, CASE_ID)).toBeNull();
  });

  it("keeps unavailable body distinct from the title and confines source links", () => {
    expect(mapBoligsidenDetails({ ...listing(), descriptionBody: " ", slugAddress: "//example.com" }, CASE_ID))
      .toMatchObject({ title: listing().descriptionTitle, description: null, sourceUrl: `https://www.boligsiden.dk/viderestilling/${CASE_ID}` });
  });
});

describe("Boligsiden listing details lookup", () => {
  it("finds the exact unit in a small geographic case search", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ totalHits: 2, cases: [{ ...listing(), caseID: NEIGHBOUR_ID, descriptionBody: "Neighbour" }, listing()] });
    const result = await (await resolver())(CASE_ID, location);
    expect(result?.description).toBe(listing().descriptionBody);
    const [url, options] = vi.mocked(fetchJson).mock.calls[0]!;
    const query = new URL(url);
    expect(query.pathname).toBe("/search/cases");
    expect(query.searchParams.get("polygon")).toBe("9.915575,57.033273|9.917225,57.033273|9.917225,57.034171|9.915575,57.034171");
    expect(query.searchParams.has("caseIDs")).toBe(false);
    expect(options).toMatchObject({ attempts: 1, timeoutMs: 3000 });
  });

  it("uses the source address identity when available and merges its buildings", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ ...listing().address, cases: [{ caseID: CASE_ID, housingArea: 43, descriptionBody: listing().descriptionBody }] });
    const result = await (await resolver())(CASE_ID, { sourceAddressId: ADDRESS_ID });
    expect(result).toMatchObject({ description: listing().descriptionBody, facts: { floors: 3, yearBuilt: 1937 } });
    expect(vi.mocked(fetchJson).mock.calls[0]?.[0]).toBe(`https://api.boligsiden.dk/addresses/${ADDRESS_ID}`);
  });

  it("rejects conflicting address evidence and duplicate matching cases", async () => {
    const fetchDetails = await resolver();
    vi.mocked(fetchJson).mockResolvedValueOnce({ addressID: NEIGHBOUR_ID, cases: [listing()] });
    expect(await fetchDetails(CASE_ID, { sourceAddressId: ADDRESS_ID })).toBeNull();
    vi.mocked(fetchJson).mockResolvedValueOnce({ cases: [listing(), listing()], totalHits: 2 });
    expect(await fetchDetails(CASE_ID, location)).toBeNull();
  });

  it("shares simultaneous reads, caches success for five minutes, and refreshes after expiry", async () => {
    const fetchDetails = await resolver();
    vi.mocked(fetchJson).mockResolvedValue({ cases: [listing()], totalHits: 1 });
    const [first, second] = await Promise.all([fetchDetails(CASE_ID, location), fetchDetails(CASE_ID, location)]);
    expect(first).toEqual(second);
    await fetchDetails(CASE_ID, location);
    expect(fetchJson).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1);
    await fetchDetails(CASE_ID, location);
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it("degrades safely when source access fails and retries after a short failure cache", async () => {
    const fetchDetails = await resolver();
    vi.mocked(fetchJson).mockRejectedValue(new Error("HTTP 403"));
    expect(await fetchDetails(CASE_ID, location)).toBeNull();
    expect(await fetchDetails(CASE_ID, location)).toBeNull();
    expect(fetchJson).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 30_001);
    vi.mocked(fetchJson).mockResolvedValue({ cases: [listing()], totalHits: 1 });
    expect(await fetchDetails(CASE_ID, location)).not.toBeNull();
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it("follows capped pages without assuming requested page size and stops repeated pages", async () => {
    const fetchDetails = await resolver();
    const other = { ...listing(), caseID: NEIGHBOUR_ID };
    vi.mocked(fetchJson).mockResolvedValueOnce({ cases: [other], totalHits: 2 }).mockResolvedValueOnce({ cases: [listing()], totalHits: 2 });
    expect(await fetchDetails(CASE_ID, location)).not.toBeNull();
    expect(new URL(vi.mocked(fetchJson).mock.calls[1]![0]).searchParams.get("page")).toBe("2");
    vi.mocked(fetchJson).mockResolvedValue({ cases: [other], totalHits: 2 });
    expect(await fetchDetails(CASE_ID, { postalCode: "9000" })).toBeNull();
    expect(fetchJson).toHaveBeenCalledTimes(4);
  });

  it("caps total source time across pages, without retries", async () => {
    vi.mocked(fetchJson).mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 3000);
      return { cases: [{ ...listing(), caseID: NEIGHBOUR_ID }], totalHits: 2 };
    });
    expect(await (await resolver())(CASE_ID, location)).toBeNull();
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("does not issue a broad nationwide request for missing or malformed identity hints", async () => {
    const fetchDetails = await resolver();
    expect(await fetchDetails("bad-id", location)).toBeNull();
    expect(await fetchDetails(CASE_ID)).toBeNull();
    expect(await fetchDetails(CASE_ID, { lat: 0, lon: 0, postalCode: "9000&all=true" })).toBeNull();
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

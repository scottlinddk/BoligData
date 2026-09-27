import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBoligaListings } from "./boliga.js";
import { fetchBoligsidenListings } from "./boligsiden.js";
import { fetchJson } from "./http.js";

vi.mock("./http.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./http.js")>(), fetchJson: vi.fn(), sleep: vi.fn().mockResolvedValue(undefined),
}));

const boliga = { id: 1, price: 2_500_000, size: 95, street: "Testvej 1", city: "Aalborg", zipCode: 9000, latitude: 57.05, longitude: 9.92 };
const boligsiden = { caseID: "case-1", priceCash: 2_500_000, housingArea: 95, coordinates: { lat: 57.05, lon: 9.92 }, address: { roadName: "Testvej", houseNumber: "1", zipCode: 9000, municipality: { name: "Aalborg" } } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRAWL_MOCK_MODE", "false");
  vi.stubEnv("CRAWL_ZIP_RANGES", "9000-9000");
  vi.stubEnv("CRAWL_PAGE_SIZE", "100");
  vi.stubEnv("CRAWL_MAX_PAGES", "1");
  vi.stubEnv("CRAWL_MAX_LISTINGS", "100");
});
afterEach(() => vi.unstubAllEnvs());

for (const [name, fetcher, valid, recordsKey] of [
  ["boliga", fetchBoligaListings, boliga, "results"],
  ["boligsiden", fetchBoligsidenListings, boligsiden, "cases"],
] as const) {
  describe(`${name} source failures and record warnings`, () => {
    it("retains valid records and bounded warnings without treating invalid records as a source failure", async () => {
      vi.mocked(fetchJson).mockResolvedValue({ [recordsKey]: [valid, ...Array.from({ length: 25 }, () => ({}))] });
      const { listings, stats } = await fetcher();
      expect(listings).toHaveLength(1);
      expect(stats.errors).toEqual([]);
      expect(stats.mappingWarnings).toHaveLength(10);
      expect(stats.recordsSkipped).toBe(25);
      expect(stats.complete).toBe(false);
    });
    it("continues to treat a malformed source page as an error", async () => {
      vi.mocked(fetchJson).mockResolvedValue({});
      const { listings, stats } = await fetcher();
      expect(listings).toEqual([]);
      expect(stats.errors).toEqual([`page 1: missing ${recordsKey} array`]);
      expect(stats.mappingWarnings).toEqual([]);
      expect(stats.complete).toBe(false);
    });
    it("continues to report an HTTP/transport error as fatal source evidence", async () => {
      vi.mocked(fetchJson).mockRejectedValue(new Error("HTTP 503"));
      const { stats } = await fetcher();
      expect(stats.errors).toEqual(["page 1: HTTP 503"]);
      expect(stats.mappingWarnings).toEqual([]);
      expect(stats.complete).toBe(false);
    });
  });
}

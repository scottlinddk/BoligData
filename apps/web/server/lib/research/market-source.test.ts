import { afterEach, describe, expect, it, vi } from "vitest";
import { estimateResearchPrice } from "../../../../../packages/shared/src/analysis/valuation.js";
import { fetchMarketSales, mapMarketAddresses, type MarketSubject } from "./market-source.js";
import { stubFetch } from "../test-support/stub-fetch.js";

const subject: MarketSubject = { id: "subject", address: "Subjectvej 30", municipality: "Aalborg", property_type: "villa", postal_code: "9000", lat: 57.05, lon: 9.90, data_mode: "real" };
const observed = "2026-09-27T10:00:00Z";
const address = (i: number, overrides: Record<string, unknown> = {}) => ({
  addressID: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, addressType: "villa", zipCode: 9000,
  municipality: { name: "Aalborg" }, coordinates: { lat: 57.055, lon: 9.92 }, road: { name: "Testvej" }, houseNumber: String(i), cityName: "Aalborg",
  registrations: [{ registrationID: `reg-${i}`, amount: 2_600_000, livingArea: 130, date: "2026-08-01", type: "normal" }], ...overrides,
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("registered market sale population", () => {
  it("prices from real sold homes that do not need an active listing, with no invented chronology", () => {
    const transactions = mapMarketAddresses(Array.from({ length: 6 }, (_, i) => address(i)), subject, "2024-09-27", observed);
    const result = estimateResearchPrice({ subject: { propertyId: subject.id, propertyType: "villa", municipality: "Aalborg", residentialArea: 130, areaEvidence: "reported", dataMode: "live", firstAsking: null, firstAskingDocumented: false, daysOnMarket: null, timeDefinition: "latest_episode_days" }, transactions, dataVersion: "test", calculatedAt: observed });
    expect(result.baseline.median).toBe(2_600_000);
    expect(result.baseline.count).toBe(6);
    expect(result.primary.median).toBeNull();
    expect(transactions.every(row => row.areaAtSale && row.firstAsking === null && row.latestEpisodeDays === null)).toBe(true);
  });
  it("validates source geography, type and identity instead of trusting server filter parameters", () => {
    const rows = [address(1, { addressID: "missing" }), address(2, { zipCode: 8000 }), address(3, { addressType: "condo" }), address(4, { municipality: { name: "Aarhus" } }), address(5, { municipality: undefined }), address(6, { coordinates: { lat: subject.lat, lon: subject.lon } }), address(7, { coordinates: { lat: 0, lon: 0 } }), address(8)];
    expect(mapMarketAddresses(rows, subject, "2024-09-27", observed).map(row => row.address)).toEqual(["Testvej 8, 9000 Aalborg"]);
  });
  it("never substitutes current, weighted or unspecified area for area at sale", () => {
    const rows = mapMarketAddresses([address(1, { housingArea: 130, registrations: [{ amount: 2_000_000, area: 130, date: "2026-01-01", type: "normal" }] })], subject, "2024-09-27", observed);
    expect(rows[0]).toMatchObject({ soldPrice: 2_000_000, residentialArea: null, areaAtSale: false, areaDefinition: "unknown" });
  });
  it("excludes the subject street/number even with different source coordinates", () => {
    expect(mapMarketAddresses([address(30, { road: { name: "Subjectvej" } })], subject, "2024-09-27", observed)).toEqual([]);
  });
  it("retains conflicts and transfer types, removes exact copies, excludes future and old dates", () => {
    const one = address(1);
    const conflict = address(1, { registrations: [{ amount: 900_000, livingArea: 130, date: "2026-08-01", type: "family" }, { amount: 1_000_000, date: "1994-01-01", type: "normal" }, { amount: 1_000_000, date: "2027-01-01", type: "normal" }] });
    const rows = mapMarketAddresses([one, one, conflict], subject, "2024-09-27", observed);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.transactionIdentity).toBe(rows[1]!.transactionIdentity);
    expect(rows[1]!.saleType).toBe("family");
  });
  it("fetches bounded recent postal sales and marks incomplete coverage", async () => {
    vi.stubEnv("BOLIGSIDEN_ADDRESS_API_BASE", "https://source.example/market-success");
    const fetch = stubFetch([{ body: { addresses: [address(1)], totalHits: 900 } }]);
    const result = await fetchMarketSales(subject, "2024-09-27");
    expect(result).toMatchObject({ status: "available", truncated: true });
    expect(result.transactions).toHaveLength(1);
    expect(fetch.urls[0]).toContain("zipCodes=9000");
    expect(fetch.urls[0]).toContain("sortBy=soldDate");
    expect(fetch.urls[0]).toContain("per_page=500");
  });
  it("rejects failures and mock/unknown subjects without fabricating market rows", async () => {
    vi.stubEnv("BOLIGSIDEN_ADDRESS_API_BASE", "https://source.example/market-error");
    const fetch = stubFetch([{ status: 403, body: { error: "unavailable" } }]);
    expect((await fetchMarketSales(subject, "2024-09-27")).status).toBe("unavailable");
    expect((await fetchMarketSales({ ...subject, data_mode: "unknown" }, "2024-09-27")).transactions).toEqual([]);
    expect(fetch.urls).toHaveLength(1);
  });
});

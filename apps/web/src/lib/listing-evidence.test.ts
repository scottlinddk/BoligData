import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Enrichment, Property, SoldPriceEntry } from "@shared/types/index";
import { listingEvidence } from "./listing-evidence";
import { mergePropertyFacts, type MergedPropertyFacts } from "./property-facts";
import { researchListingTime } from "./research-listing-time";

const AS_OF = "2026-09-26";
const property = { id: "subject", address: "Bejsebakkevej 30", price: 3_850_000, sqm: 140, rooms: 5,
  dataMode: "unknown", status: "active", propertyType: "villa", municipality: "Aalborg", listingSource: "boligsiden", externalId: "case-1",
  listingDate: "2026-06-28", firstSeenAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-26T00:00:00Z" } as Property;
const ownSale: SoldPriceEntry = { soldDate: "2025-04-01", price: 3_000_000, pricePerSqm: null, saleType: "normal" };
const storedFacts = (sales: SoldPriceEntry[], mode?: "real" | "mock" | "unknown") => mergePropertyFacts(property, {
  soldPriceHistory: sales,
  ...(mode ? { sourceStatus: { sales: { dataMode: mode, observedAt: `${AS_OF}T00:00:00Z`, verificationStatus: "unverified", method: "source_registration", reason: null } } } : {}),
} as Enrichment, null);
const evidence = (target: Property = property, facts?: MergedPropertyFacts, asOf = AS_OF) => listingEvidence(target, researchListingTime(target), facts, asOf);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${AS_OF}T12:00:00Z`)); });
afterEach(() => vi.useRealTimers());

describe("reported listing evidence", () => {
  it("shows known legacy asking, area, rooms and reported date without promoting valuation chronology", () => {
    const listing = researchListingTime(property);
    const originalProperty = structuredClone(property);
    const originalListing = structuredClone(listing);
    const result = listingEvidence(property, listing, undefined, AS_OF);
    expect(result).toMatchObject({ asking: 3_850_000, area: 140, rooms: 5, pricePerSqm: 27_500, days: 90, documentedDays: false, synthetic: false });
    expect(listing.time.latestEpisodeDays).toBeNull();
    expect(listing.time.activeDays).toBeNull();
    expect(listing.time.calendarDays).toBeNull();
    expect(property).toEqual(originalProperty);
    expect(listing).toEqual(originalListing);
    expect(result.firstAsking).toBeNull();
    expect(result.priceChange).toBeNull();
  });

  it("distinguishes documented current-listing time from a reported legacy date", () => {
    expect(evidence({ ...property, dataMode: "real" })).toMatchObject({ days: 90, documentedDays: true });
    expect(evidence({ ...property, listingDate: AS_OF })).toMatchObject({ days: 0, documentedDays: false });
  });

  it.each(["mock", "demo"] as const)("labels %s fields synthetic and does not turn its advertised date into elapsed days", dataMode => {
    const result = evidence({ ...property, dataMode });
    expect(result).toMatchObject({ synthetic: true, days: null, documentedDays: false, asking: 3_850_000, area: 140 });
  });

  it.each([null, "", "2026-02-30", "2026-12-01", "2026-06", "invalid"])("does not fabricate listing time for date %j", listingDate => {
    expect(evidence({ ...property, listingDate }).days).toBeNull();
  });

  it("does not use a crawler observation as a source listing date or an invalid calculation day", () => {
    expect(evidence({ ...property, listingDate: null, firstSeenAt: "2026-01-01T00:00:00Z" }).days).toBeNull();
    expect(evidence(property, undefined, "2026-02-30").days).toBeNull();
    expect(evidence(property, undefined, "invalid").days).toBeNull();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("omits invalid asking/area/rooms %s rather than showing free or zero-sized homes", value => {
    const result = evidence({ ...property, price: value, sqm: value, rooms: value });
    expect(result).toMatchObject({ asking: null, area: null, pricePerSqm: null, rooms: null });
  });

  it("does not calculate a unit price when either side is unknown", () => {
    expect(evidence({ ...property, price: 0, sqm: 140 }).pricePerSqm).toBeNull();
    expect(evidence({ ...property, price: 3_850_000, sqm: 0 }).pricePerSqm).toBeNull();
  });
});

describe("registered evidence stays distinct from listing and market estimates", () => {
  it("uses only source-provenanced own-property sale history from the facts merge", () => {
    expect(evidence(property, storedFacts([ownSale], "real")).lastSale).toEqual(ownSale);
    for (const mode of [undefined, "unknown", "mock"] as const) expect(evidence(property, storedFacts([ownSale], mode)).lastSale).toBeNull();
    // A neighbour's sale is not the subject property's last sale.
    const facts = storedFacts([], "real");
    facts.nearbySales = [{ ...ownSale, price: 9_000_000, address: "Another street" }] as unknown as MergedPropertyFacts["nearbySales"];
    expect(evidence(property, facts).lastSale).toBeNull();
  });

  it("preserves transfer type and selects the latest valid date without mutating sale order", () => {
    const family = { ...ownSale, soldDate: "2026-08-01", price: 2_000_000, saleType: "family" as const };
    const sales: SoldPriceEntry[] = [ownSale, { ...ownSale, soldDate: "2027-01-01" }, family, { ...ownSale, soldDate: "2026-02-30" }, { ...ownSale, soldDate: "2026-09-01", price: 0 }];
    const facts = storedFacts(sales, "real");
    const before = structuredClone(facts);
    expect(evidence(property, facts).lastSale).toEqual(family);
    expect(facts).toEqual(before);
    expect(evidence(property, facts).firstAsking).toBeNull();
  });

  it("requires explicit history provenance and omits invalid registered areas defensively", () => {
    const facts = storedFacts([ownSale], "real");
    expect(evidence(property, { ...facts, priceHistorySource: null }).lastSale).toBeNull();
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(evidence(property, { ...facts, registerAreaSqm: value }).registerArea).toBeNull();
    expect(evidence(property, { ...facts, registerAreaSqm: 130 }).registerArea).toBe(130);
  });

  it("reports signed change only against documented first asking, never the own-property sold price", () => {
    const listing = { ...researchListingTime({ ...property, dataMode: "real" }), firstAsking: 4_100_000 };
    expect(listingEvidence(property, listing, storedFacts([ownSale], "real"), AS_OF).priceChange).toBe(-250_000);
    expect(listingEvidence({ ...property, price: 4_250_000 }, listing, undefined, AS_OF).priceChange).toBe(150_000);
  });
});

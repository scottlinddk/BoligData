import { describe, expect, it } from "vitest";
import type { Property } from "@shared/types/index";
import type { SparListingEstimate } from "@shared/types/spar";
import { COMPARE_MAX, compareValues, parseCompareIds, toggleCompareId } from "./compare";

const property = (over: Partial<Property> = {}): Property => ({
  id: "a", address: "Hobrovej 79", municipality: "Aalborg", postalCode: "9000", status: "active", price: 3_000_000, sqm: 150, rooms: 5, images: [],
  riskFlags: null, listingSource: "saved_address", listingDate: "2026-09-01", agentName: null, externalId: "1", lat: 57, lon: 9.9, buildingYear: 1930,
  propertyType: "villa", description: null, listingUrl: null, agentUserId: null, isPromoted: false, promotedAt: null, promotedBy: null,
  idLokalid: null, matrikelnr: null, ejerlav: null, zone: null, bfeNummer: null, registeredAreaSqm: null, bbrData: null, createdAt: "", updatedAt: "", ...over,
});
const spar = (over: Partial<SparListingEstimate> = {}): SparListingEstimate => ({
  status: "available", reason: null, isUnit: false, valuation: { valueDkk: 2_500_000, year: 2024, bfe: "1" }, index: null,
  fairPrice: { estimate: 2_900_000, lo80: 2_600_000, hi80: 3_200_000, lo95: 2_400_000, hi95: 3_400_000 }, askingPrice: 3_000_000, askingVsFair: 0.034,
  history: [], asOf: "2026-10-01", method: "own-spar-local-level/1", ...over,
});

describe("parseCompareIds", () => {
  it("needs at least two distinct ids and caps at the maximum", () => {
    expect(parseCompareIds("a,b")).toEqual(["a", "b"]);
    expect(parseCompareIds(" a , a , b ")).toEqual(["a", "b"]);
    expect(parseCompareIds("a")).toBeNull();
    expect(parseCompareIds("a,a")).toBeNull();
    expect(parseCompareIds(null)).toBeNull();
    expect(parseCompareIds("a,b,c,d,e")).toHaveLength(COMPARE_MAX);
  });
});

describe("toggleCompareId", () => {
  it("adds, removes and refuses past the cap", () => {
    expect(toggleCompareId([], "a")).toEqual({ ids: ["a"], full: false });
    expect(toggleCompareId(["a", "b"], "a")).toEqual({ ids: ["b"], full: false });
    expect(toggleCompareId(["a", "b", "c"], "d")).toEqual({ ids: ["a", "b", "c"], full: true });
    expect(toggleCompareId(["a", "b", "c"], "c")).toEqual({ ids: ["a", "b"], full: false });
  });
});

describe("compareValues", () => {
  it("derives price per m² and time on market for an active listing", () => {
    const v = compareValues(property(), spar(), "2026-09-11T00:00:00Z");
    expect(v.pricePerSqm).toBe(20_000);
    expect(v.daysOnMarket).toBe(10);
    expect(v.fair?.estimate).toBe(2_900_000);
    expect(v.valuation).toEqual({ valueDkk: 2_500_000, year: 2024 });
  });
  it("keeps unknowns null instead of zero", () => {
    const v = compareValues(property({ sqm: 0, rooms: null, buildingYear: null, status: "sold" }), null);
    expect(v).toMatchObject({ pricePerSqm: null, sqm: null, rooms: null, buildingYear: null, daysOnMarket: null, fair: null, valuation: null, askingVsFair: null });
  });
  it("ignores an unavailable estimate", () => {
    expect(compareValues(property(), spar({ status: "insufficient_data", reason: "too_few_sales", fairPrice: null, valuation: null, askingVsFair: null })).fair).toBeNull();
  });
});

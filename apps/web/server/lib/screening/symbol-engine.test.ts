import { describe, expect, it } from "vitest";
import { evaluateScreening } from "./symbol-engine.js";
import type { PropertyLookupInput, RenovationCategoryResult } from "../../../../../packages/shared/src/types/property-lookup.js";

const baseInput: PropertyLookupInput = {
  address: "Skomagergyden 4, 9000 Aalborg",
  askingPrice: 2_000_000,
};

const renovationCategory: RenovationCategoryResult = {
  category: "B",
  isEstimate: true,
  symbol: "~",
  reason: "test fixture",
  source: "ai",
};

describe("evaluateScreening", () => {
  it("returns all six hard criteria, every result tagged source: ai", () => {
    const results = evaluateScreening({
      input: baseInput,
      areaSqm: 140,
      roomCount: 5,
      energyLabel: "B",
      renovationCategory,
    });

    expect(results.map((r) => r.key)).toEqual([
      "priceCeiling",
      "monthlyCost",
      "area",
      "rooms",
      "takeoverDate",
      "encumbranceRatio",
    ]);
    for (const result of results) {
      expect(result.source).toBe("ai");
    }
  });

  it("defaults to room-count definition B when the caller doesn't specify one", () => {
    const results = evaluateScreening({
      input: baseInput,
      areaSqm: 140,
      roomCount: 5,
      energyLabel: null,
      renovationCategory,
    });
    const roomsResult = results.find((r) => r.key === "rooms");
    expect(roomsResult?.reason).toMatch(/definition B/);
  });

  it("reports the three price-based criteria as unavailable when there is no asking price", () => {
    const results = evaluateScreening({
      input: { address: "Skomagergyden 4, 9000 Aalborg", askingPrice: null, totalEncumbrancesDkk: 100_000 },
      areaSqm: 140,
      roomCount: 5,
      energyLabel: "B",
      renovationCategory,
    });

    const byKey = Object.fromEntries(results.map((r) => [r.key, r]));
    for (const key of ["priceCeiling", "monthlyCost", "encumbranceRatio"]) {
      expect(byKey[key]).toMatchObject({ symbol: "~", passed: false, source: "ai" });
      expect(byKey[key]?.reason).toMatch(/No asking price/);
    }
    // Criteria that don't depend on a price are still evaluated.
    expect(byKey.area?.symbol).toBe("✅");
    expect(byKey.rooms?.symbol).not.toBe("~");
    expect(results).toHaveLength(6);
  });
});

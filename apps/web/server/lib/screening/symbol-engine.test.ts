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
});

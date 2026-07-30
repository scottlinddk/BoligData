import { describe, expect, it } from "vitest";
import { extractScoringInputs } from "./relative-score-inputs.js";
import type { PropertyLookupInput, RenovationCategoryResult } from "../../../../../packages/shared/src/types/property-lookup.js";
import { DEFAULT_FINANCING_ASSUMPTIONS } from "../screening/config/financing-assumptions.js";

const input: PropertyLookupInput = {
  address: "Skomagergyden 4, 9000 Aalborg",
  askingPrice: 2_000_000,
  totalEncumbrancesDkk: 100_000,
};

const renovationCategory: RenovationCategoryResult = {
  category: "B",
  isEstimate: true,
  symbol: "~",
  reason: "test fixture",
  source: "ai",
};

describe("extractScoringInputs", () => {
  it("computes the seven raw inputs without collapsing them into a score", () => {
    const result = extractScoringInputs({
      input,
      areaSqm: 150,
      renovationCategory,
      noiseExposureLden: 55,
    });

    expect(result.source).toBe("ai");
    expect(result.conditionProxy).toBe(3); // category B
    expect(result.priceHeadroomDkk).toBe(
      DEFAULT_FINANCING_ASSUMPTIONS.priceCeilingByRenovationCategory.B - input.askingPrice,
    );
    expect(result.areaMarginSqm).toBe(150 - DEFAULT_FINANCING_ASSUMPTIONS.minAreaSqm);
    expect(result.legalRiskProxy).toBeCloseTo(1 - 100_000 / 2_000_000);
    expect(result.noiseZoneEstimate).toBe(55);
    expect(result.locationMatch).toBeNull();
    expect(result.schoolDistrictScore).toBeNull();
  });

  it("returns null legalRiskProxy when encumbrances are unknown", () => {
    const result = extractScoringInputs({
      input: { ...input, totalEncumbrancesDkk: null },
      areaSqm: 150,
      renovationCategory,
      noiseExposureLden: null,
    });
    expect(result.legalRiskProxy).toBeNull();
  });
});

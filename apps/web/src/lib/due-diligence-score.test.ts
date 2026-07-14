import { describe, expect, it } from "vitest";
import { calculateDueDiligenceScore } from "@shared/utils/due-diligence-score";
import type { RiskFlags } from "@shared/types/index";

const baseFlags: RiskFlags = {
  noiseExposureLden: 45,
  encumbranceCheckRequired: true,
  encumbranceLookupUrl: null,
  sewerSeparationCheckRequired: true,
  sewerSeparationLookupUrl: null,
  oilTankRisk: false,
  oilTankRiskSource: "heuristic",
  soilContamination: { classification: "none", jordart: null },
  soilContaminationAttestUrl: null,
};

describe("calculateDueDiligenceScore", () => {
  it("returns null when there's no enrichment yet", () => {
    expect(calculateDueDiligenceScore(null, 20000, 20000)).toEqual({ score: null, deductions: [] });
  });

  it("scores a clean property with a fair price at 10", () => {
    const result = calculateDueDiligenceScore(baseFlags, 20000, 20000);
    expect(result.score).toBe(10);
    expect(result.deductions).toEqual([]);
  });

  it("deducts for noise above the warning threshold", () => {
    const result = calculateDueDiligenceScore({ ...baseFlags, noiseExposureLden: 62 }, 20000, 20000);
    expect(result.score).toBe(8.5);
  });

  it("deducts more for confirmed (BBR) oil tank risk than heuristic-only", () => {
    const bbr = calculateDueDiligenceScore(
      { ...baseFlags, oilTankRisk: true, oilTankRiskSource: "bbr" },
      20000,
      20000,
    );
    const heuristic = calculateDueDiligenceScore(
      { ...baseFlags, oilTankRisk: true, oilTankRiskSource: "heuristic" },
      20000,
      20000,
    );
    expect(bbr.score).toBe(8.5);
    expect(heuristic.score).toBe(9);
  });

  it("deducts for v1/v2 soil contamination, less for unknown", () => {
    const v2 = calculateDueDiligenceScore(
      { ...baseFlags, soilContamination: { classification: "v2", jordart: null } },
      20000,
      20000,
    );
    const v1 = calculateDueDiligenceScore(
      { ...baseFlags, soilContamination: { classification: "v1", jordart: null } },
      20000,
      20000,
    );
    const unknown = calculateDueDiligenceScore(
      { ...baseFlags, soilContamination: { classification: "unknown", jordart: null } },
      20000,
      20000,
    );
    expect(v2.score).toBe(8);
    expect(v1.score).toBe(9);
    expect(unknown.score).toBe(9.8); // 9.75 rounded to one decimal
  });

  it("deducts for price well above the neighborhood average, none when priced at/below it", () => {
    const overpriced = calculateDueDiligenceScore(baseFlags, 27000, 20000); // +35%
    const slightlyHigh = calculateDueDiligenceScore(baseFlags, 23500, 20000); // +17.5%
    const fair = calculateDueDiligenceScore(baseFlags, 18000, 20000); // -10%
    expect(overpriced.score).toBe(8);
    expect(slightlyHigh.score).toBe(9);
    expect(fair.score).toBe(10);
  });

  it("ignores price deviation when no comparables are available", () => {
    const result = calculateDueDiligenceScore(baseFlags, 50000, null);
    expect(result.score).toBe(10);
  });

  it("stacks every deduction for the worst realistic case, clamped at 0 if it ever overshoots", () => {
    const worst = calculateDueDiligenceScore(
      {
        ...baseFlags,
        noiseExposureLden: 70,
        oilTankRisk: true,
        oilTankRiskSource: "bbr",
        soilContamination: { classification: "v2", jordart: null },
      },
      30000,
      20000,
    );
    expect(worst.score).toBe(3); // 10 - 1.5 (noise) - 1.5 (oil tank, bbr) - 2 (soil v2) - 2 (price +50%)
    expect(worst.score).toBeGreaterThanOrEqual(0);
  });
});

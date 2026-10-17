import { describe, expect, it } from "vitest";
import { BOLIGSKAT_RATES_2024, estimateBoligskat } from "@shared/analysis/boligskat";

describe("estimateBoligskat", () => {
  it("reproduces the Maren Hemmings Vej 11 reference figures", () => {
    const result = estimateBoligskat({ ejendomsvaerdiDkk: 3_984_000, grundvaerdiDkk: 2_076_000, grundskyldPromille: 5.92 });
    expect(result).toMatchObject({ ejendomsvaerdiskatDkk: 16_255, grundskyldDkk: 12_290, totalDkk: 28_545, unavailable: [], isEstimate: true });
    expect(result.ratesVersion).toBe(BOLIGSKAT_RATES_2024.ratesVersion);
    expect(result.assumptions.length).toBeGreaterThan(0);
  });

  it("applies the higher rate only above the progression limit", () => {
    const result = estimateBoligskat({ ejendomsvaerdiDkk: 10_200_000, grundvaerdiDkk: null, grundskyldPromille: null });
    expect(result.ejendomsvaerdiskatDkk).toBe(Math.round((9_200_000 * 0.0051 + 1_000_000 * 0.014) * 0.8));
  });

  it("returns no grundskyld and no total when the municipal rate is unknown", () => {
    const result = estimateBoligskat({ ejendomsvaerdiDkk: 3_984_000, grundvaerdiDkk: 2_076_000, grundskyldPromille: null });
    expect(result.ejendomsvaerdiskatDkk).toBe(16_255);
    expect(result).toMatchObject({ grundskyldDkk: null, totalDkk: null, unavailable: ["missing_grundskyld_promille"] });
  });

  it("reports every missing input and never fabricates values", () => {
    const result = estimateBoligskat({ ejendomsvaerdiDkk: null, grundvaerdiDkk: 0, grundskyldPromille: Number.NaN });
    expect(result).toMatchObject({ ejendomsvaerdiskatDkk: null, grundskyldDkk: null, totalDkk: null });
    expect(result.unavailable).toEqual(["missing_ejendomsvaerdi", "missing_grundvaerdi", "missing_grundskyld_promille"]);
  });
});

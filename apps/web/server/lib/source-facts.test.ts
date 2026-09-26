import { describe, expect, it } from "vitest";
import { rowToEnrichment } from "./row-mappers.js";
import { safeRiskFlags } from "./source-facts.js";

const rawRisk = {
  noiseExposureLden: 43, oilTankRisk: false, oilTankRiskSource: "bbr",
  soilContamination: { classification: "none", jordart: "Sand" },
};

describe("stored register provenance", () => {
  it("does not expose old synthetic enrichment values without explicit source provenance", () => {
    const result = rowToEnrichment({
      bbr_data: { areaSqm: 180, energyLabel: "A", renovationYear: 2023 },
      risk_flags: rawRisk, public_valuation: { assessedPropertyValueDkk: 5_000_000 },
      sold_price_history: [{ soldDate: "2024-01-01", price: 4_000_000, pricePerSqm: 20000 }],
    });
    expect(Object.values(result.bbrData).every((value) => value === null)).toBe(true);
    expect(result.publicValuation).toBeNull();
    expect(result.soldPriceHistory).toEqual([]);
    expect(result.riskFlags).toMatchObject({ noiseExposureLden: null, oilTankRiskSource: "heuristic", soilContamination: { classification: "unknown", jordart: null } });
  });

  it("checks each source independently instead of trusting an overall datafordeler label", () => {
    const result = safeRiskFlags({ source: "datafordeler", risk_flags: rawRisk, source_status: {
      noise: { dataMode: "mock" }, bbr: { dataMode: "real" }, soil_contamination: { dataMode: "unavailable" }, soil_type: { dataMode: "real" },
    } });
    expect(result).toMatchObject({ noiseExposureLden: null, oilTankRiskSource: "bbr", soilContamination: { classification: "unknown", jordart: "Sand" } });
  });

  it("retains documented live measurements and clearly identified listing heuristics", () => {
    const result = safeRiskFlags({ risk_flags: { ...rawRisk, oilTankRisk: true, oilTankRiskSource: "heuristic" }, source_status: {
      noise: { dataMode: "real" }, soil_contamination: { dataMode: "real" }, sales: { dataMode: "real" },
    } });
    expect(result).toMatchObject({ noiseExposureLden: 43, oilTankRisk: true, oilTankRiskSource: "heuristic", soilContamination: { classification: "none" } });
  });
});

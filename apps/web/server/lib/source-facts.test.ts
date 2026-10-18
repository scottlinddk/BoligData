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

  it("keeps the building case link and defaults it to null for rows that predate it", () => {
    const url = "https://weblager.dk/public/municipality/851/45/search/all";
    expect(safeRiskFlags({ risk_flags: { ...rawRisk, buildingCaseArchiveUrl: url } })?.buildingCaseArchiveUrl).toBe(url);
    expect(safeRiskFlags({ risk_flags: rawRisk })?.buildingCaseArchiveUrl).toBeNull();
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

  const tank = {
    sizeLiters: 1500, manufacturedYear: 1978, installedYear: 1978, decommissionDeadline: "2028-12-31", decommissionedYear: null,
    decommissioned: false, inOperation: true, placementCode: null, contentCode: null,
  };
  const land = { totalAreaSqm: 812, parcelCount: 1, forestReserve: { areaSqm: 300 }, beachProtection: null, duneProtection: null, entailedForest: false, agriculturalNote: null, commonLot: false, condominiumParent: false };
  const valuation = { year: 2024, propertyValueDkk: 3_150_000, landValueDkk: 780_000, previousYear: 2022, previousPropertyValueDkk: 2_900_000 };
  const stored = { ...rawRisk, oilTankRisk: true, oilTanks: { tanks: [tank] }, landRegistration: land, valuation };

  it("keeps the tank, land and valuation findings of registers whose own observation was real", () => {
    const result = safeRiskFlags({ risk_flags: stored, source_status: { oil_tanks: { dataMode: "real" }, land: { dataMode: "real" }, valuation: { dataMode: "real" } } });
    expect(result).toMatchObject({ oilTanks: { tanks: [tank] }, landRegistration: land, valuation });
  });

  it("keeps a tank finding when only the tank register was real, since BBR heating is a different observation", () => {
    const result = safeRiskFlags({ risk_flags: stored, source_status: { oil_tanks: { dataMode: "real" }, bbr: { dataMode: "unavailable" } } });
    expect(result).toMatchObject({ oilTankRisk: true, oilTankRiskSource: "bbr" });
  });

  it("drops each finding whose register was mock, unavailable or never recorded, as rows from before them are", () => {
    const result = safeRiskFlags({ risk_flags: stored, source_status: { oil_tanks: { dataMode: "mock" }, land: { dataMode: "unavailable" } } });
    expect(result).toMatchObject({ oilTanks: null, landRegistration: null, valuation: null });
    expect(safeRiskFlags({ risk_flags: rawRisk })).toMatchObject({ oilTanks: null, landRegistration: null, valuation: null });
  });
});

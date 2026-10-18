import { describe, expect, it } from "vitest";
import type { RiskFlags } from "@shared/types/index";
import { mergeRiskFlags } from "@shared/utils/merge-risk-flags";
import { riskStatuses } from "@shared/utils/risk-status";

const unknown: RiskFlags = {
  noiseExposureLden: null, noiseBand: null, noiseChecked: false, encumbranceCheckRequired: true, encumbranceLookupUrl: null,
  sewerSeparationCheckRequired: true, sewerSeparationLookupUrl: null, buildingCaseArchiveUrl: null,
  oilTankRisk: false, oilTankRiskSource: "heuristic", soilContamination: { classification: "unknown", jordart: null },
  soilContaminationAttestUrl: null,
};

describe("mergeRiskFlags", () => {
  it("takes each live answer over a stored unknown", () => {
    const live: RiskFlags = { ...unknown, noiseChecked: true, oilTankRiskSource: "bbr", heatingInstallation: "fjernvarme",
      soilContamination: { classification: "none", jordart: null }, encumbranceLookupUrl: "https://www.tinglysning.dk/" };
    const merged = mergeRiskFlags(live, unknown)!;
    expect(riskStatuses(merged)).toEqual({ noise: "ok", oilTank: "ok", soil: "ok" });
    expect(merged.encumbranceLookupUrl).toBe("https://www.tinglysning.dk/");
  });

  it("keeps a stored answer when the live register did not answer this time", () => {
    const stored: RiskFlags = { ...unknown, noiseBand: { lowerDb: 65, upperDb: 69, source: "major_roads" }, noiseChecked: true,
      soilContamination: { classification: "v2", jordart: "ler" }, soilContaminationSiteName: "Nedlagt gasværk",
      oilTankRisk: true, oilTankRiskSource: "heuristic", sewerSeparationLookupUrl: "https://www.aalborg.dk/" };
    const merged = mergeRiskFlags(unknown, stored)!;
    expect(riskStatuses(merged)).toEqual({ noise: "warning", oilTank: "warning", soil: "warning" });
    expect(merged).toMatchObject({ soilContaminationSiteName: "Nedlagt gasværk", sewerSeparationLookupUrl: "https://www.aalborg.dk/" });
  });

  it("lets a live BBR answer replace a stored building-year heuristic", () => {
    const stored: RiskFlags = { ...unknown, oilTankRisk: true, oilTankRiskSource: "heuristic" };
    const live: RiskFlags = { ...unknown, oilTankRisk: false, oilTankRiskSource: "bbr", heatingInstallation: "varmepumpe" };
    expect(mergeRiskFlags(live, stored)).toMatchObject({ oilTankRisk: false, oilTankRiskSource: "bbr", heatingInstallation: "varmepumpe" });
  });

  it("passes either side through when the other is missing", () => {
    expect(mergeRiskFlags(null, unknown)).toBe(unknown);
    expect(mergeRiskFlags(unknown, null)).toBe(unknown);
    expect(mergeRiskFlags(null, null)).toBeNull();
  });

  it("carries the land, tank and valuation answers from whichever side has them", () => {
    const land = { totalAreaSqm: 812, parcelCount: 1, forestReserve: null, beachProtection: null, duneProtection: null, entailedForest: false, agriculturalNote: null, commonLot: false, condominiumParent: false };
    const valuation = { year: 2024, propertyValueDkk: 3_150_000, landValueDkk: 780_000, previousYear: 2022, previousPropertyValueDkk: 2_900_000 };
    const oilTanks = { tanks: [] };
    const stored: RiskFlags = { ...unknown, landRegistration: land, valuation, oilTanks };
    expect(mergeRiskFlags(unknown, stored)).toMatchObject({ landRegistration: land, valuation, oilTanks });
    expect(mergeRiskFlags(stored, unknown)).toMatchObject({ landRegistration: land, valuation, oilTanks });
    // A live answer replaces the stored one.
    const live: RiskFlags = { ...unknown, landRegistration: { ...land, totalAreaSqm: 900 } };
    expect(mergeRiskFlags(live, stored)?.landRegistration?.totalAreaSqm).toBe(900);
  });
});

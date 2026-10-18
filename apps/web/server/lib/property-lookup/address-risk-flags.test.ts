import { describe, expect, it } from "vitest";
import { riskStatuses } from "../../../../../packages/shared/src/utils/risk-status.js";
import { buildAddressRiskFlags } from "./address-risk-flags.js";

const quiet = { ldenDb: null, band: null };
const base = { municipalityCode: "0851", bbr: { heatingInstallation: "fjernvarme" }, noise: quiet, soil: { classification: "none" as const } };

describe("buildAddressRiskFlags", () => {
  it("takes the oil tank risk from BBR's registered heating, and says so", () => {
    expect(buildAddressRiskFlags({ ...base, bbr: { heatingInstallation: "oliefyr" } })).toMatchObject({ oilTankRisk: true, oilTankRiskSource: "bbr", heatingInstallation: "oliefyr" });
    expect(buildAddressRiskFlags(base)).toMatchObject({ oilTankRisk: false, oilTankRiskSource: "bbr" });
    expect(riskStatuses(buildAddressRiskFlags({ ...base, bbr: { heatingInstallation: "oliefyr" } })).oilTank).toBe("warning");
    expect(riskStatuses(buildAddressRiskFlags(base)).oilTank).toBe("ok");
  });

  it("leaves the oil tank unknown when BBR has no heating, no building, or central heating of unknown fuel", () => {
    for (const bbr of [null, { heatingInstallation: null }, { heatingInstallation: "centralvarme" }, { heatingInstallation: "ovne" }]) {
      const flags = buildAddressRiskFlags({ ...base, bbr });
      expect(flags.oilTankRiskSource).toBe("heuristic");
      expect(riskStatuses(flags).oilTank).toBe("unknown");
    }
  });

  it("reads a mapped noise band as a warning, no band as ok, and no answer as unknown", () => {
    const loud = { ldenDb: 60, band: { lowerDb: 60, upperDb: 64, source: "roads_in_towns" as const } };
    expect(buildAddressRiskFlags({ ...base, noise: loud })).toMatchObject({ noiseBand: loud.band, noiseChecked: true, noiseExposureLden: null });
    expect(riskStatuses(buildAddressRiskFlags({ ...base, noise: loud })).noise).toBe("warning");
    expect(riskStatuses(buildAddressRiskFlags(base)).noise).toBe("ok");
    expect(riskStatuses(buildAddressRiskFlags({ ...base, noise: null })).noise).toBe("unknown");
  });

  it("reports the soil register's answer with its attest link, and no answer as unknown", () => {
    const mapped = { classification: "v1" as const, attestUrl: "https://jord.miljoeportal.dk/report/?elav=2005051&matrnr=327b", locationName: "Tidligere autoværksted" };
    expect(buildAddressRiskFlags({ ...base, soil: mapped })).toMatchObject({
      soilContamination: { classification: "v1" }, soilContaminationAttestUrl: mapped.attestUrl, soilContaminationSiteName: "Tidligere autoværksted",
    });
    expect(riskStatuses(buildAddressRiskFlags(base)).soil).toBe("ok");
    const unknown = buildAddressRiskFlags({ ...base, soil: null });
    expect(unknown.soilContamination.classification).toBe("unknown");
    expect(riskStatuses(unknown).soil).toBe("unknown");
  });

  it("links the municipality's pages from its code", () => {
    const flags = buildAddressRiskFlags(base);
    expect(flags.buildingCaseArchiveUrl).toBe("https://weblager.dk/public/municipality/851/45/search/all");
    expect(flags.sewerSeparationLookupUrl).toBe("https://www.aalborg.dk/");
    expect(buildAddressRiskFlags({ ...base, municipalityCode: "0860" })).toMatchObject({ buildingCaseArchiveUrl: null, sewerSeparationLookupUrl: "https://hjoerring.dk/" });
    for (const municipalityCode of ["0101", null]) {
      expect(buildAddressRiskFlags({ ...base, municipalityCode })).toMatchObject({ buildingCaseArchiveUrl: null, sewerSeparationLookupUrl: null });
    }
  });

  it("always points at the land register's entry page and keeps the check advisory", () => {
    expect(buildAddressRiskFlags({ ...base, municipalityCode: null })).toMatchObject({ encumbranceLookupUrl: "https://www.tinglysning.dk/", encumbranceCheckRequired: true, sewerSeparationCheckRequired: true });
  });

  const tank = {
    sizeLiters: 1500, manufacturedYear: 1978, installedYear: 1978, decommissionDeadline: "2028-12-31", decommissionedYear: null,
    decommissioned: false, inOperation: true, placementCode: null, contentCode: null,
  };

  it("warns about a registered tank even when the heating is district heating", () => {
    const flags = buildAddressRiskFlags({ ...base, tanks: { tanks: [tank] } });
    expect(flags).toMatchObject({ oilTankRisk: true, oilTankRiskSource: "bbr", heatingInstallation: "fjernvarme" });
    expect(flags.oilTanks?.tanks).toHaveLength(1);
    expect(riskStatuses(flags).oilTank).toBe("warning");
  });

  it("answers from the heating alone when every registered tank is decommissioned, and keeps them in the list", () => {
    const flags = buildAddressRiskFlags({ ...base, tanks: { tanks: [{ ...tank, decommissioned: true, decommissionedYear: 2014 }] } });
    expect(riskStatuses(flags).oilTank).toBe("ok");
    expect(flags.oilTanks?.tanks[0]).toMatchObject({ decommissionedYear: 2014 });
  });

  it("leaves the oil tank unknown when the heating is unknown and the register lists no tank: absence is not evidence", () => {
    const flags = buildAddressRiskFlags({ ...base, bbr: null, tanks: { tanks: [] } });
    expect(riskStatuses(flags).oilTank).toBe("unknown");
    expect(flags.oilTanks).toEqual({ tanks: [] });
  });

  it("carries MAT's land findings and the public valuation, and nothing when they were not asked", () => {
    const land = { totalAreaSqm: 812, parcelCount: 1, forestReserve: { areaSqm: 300 }, beachProtection: null, duneProtection: null, entailedForest: false, agriculturalNote: null, commonLot: false, condominiumParent: false };
    const flags = buildAddressRiskFlags({
      ...base, land,
      valuation: { assessedPropertyValueDkk: 3_150_000, assessedLandValueDkk: 780_000, valuationYear: 2024, previousYear: 2022, previousPropertyValueDkk: 2_900_000 },
    });
    expect(flags.landRegistration).toEqual(land);
    expect(flags.valuation).toEqual({ year: 2024, propertyValueDkk: 3_150_000, landValueDkk: 780_000, previousYear: 2022, previousPropertyValueDkk: 2_900_000 });
    expect(buildAddressRiskFlags(base)).toMatchObject({ landRegistration: null, valuation: null, oilTanks: null });
  });

  it("drops a valuation that has no year or no property value", () => {
    const flags = buildAddressRiskFlags({ ...base, valuation: { assessedPropertyValueDkk: null, assessedLandValueDkk: 1, valuationYear: 2024, previousYear: null, previousPropertyValueDkk: null } });
    expect(flags.valuation).toBeNull();
  });
});

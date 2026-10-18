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
});

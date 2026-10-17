import { describe, expect, it } from "vitest";
import { riskStatuses } from "../../../../../packages/shared/src/utils/risk-status.js";
import { buildAddressRiskFlags } from "./address-risk-flags.js";

const base = { municipalityCode: "0851", bbr: { heatingInstallation: "fjernvarme" }, noiseLden: 52 };

describe("buildAddressRiskFlags", () => {
  it("takes the oil tank risk from BBR's registered heating, and says so", () => {
    expect(buildAddressRiskFlags({ ...base, bbr: { heatingInstallation: "oliefyr" } })).toMatchObject({ oilTankRisk: true, oilTankRiskSource: "bbr" });
    expect(buildAddressRiskFlags(base)).toMatchObject({ oilTankRisk: false, oilTankRiskSource: "bbr" });
    expect(riskStatuses(buildAddressRiskFlags({ ...base, bbr: { heatingInstallation: "oliefyr" } })).oilTank).toBe("warning");
    expect(riskStatuses(buildAddressRiskFlags(base)).oilTank).toBe("ok");
  });

  it("leaves the oil tank unknown, never guessed from age, when BBR has no heating or no building", () => {
    for (const bbr of [null, { heatingInstallation: null }]) {
      const flags = buildAddressRiskFlags({ ...base, bbr });
      expect(flags.oilTankRiskSource).toBe("heuristic");
      expect(riskStatuses(flags).oilTank).toBe("unknown");
    }
  });

  it("reports the noise reading, and an absent reading as unknown rather than quiet", () => {
    expect(buildAddressRiskFlags(base).noiseExposureLden).toBe(52);
    expect(riskStatuses(buildAddressRiskFlags(base)).noise).toBe("ok");
    expect(riskStatuses(buildAddressRiskFlags({ ...base, noiseLden: 63 })).noise).toBe("warning");
    expect(riskStatuses(buildAddressRiskFlags({ ...base, noiseLden: null })).noise).toBe("unknown");
  });

  it("links the municipality's pages from its code, as a listing does from its name", () => {
    const flags = buildAddressRiskFlags(base);
    expect(flags.buildingCaseArchiveUrl).toBe("https://weblager.dk/public/municipality/851/45/search/all");
    expect(flags.sewerSeparationLookupUrl).toBe("https://www.aalborg.dk/");
    expect(buildAddressRiskFlags({ ...base, municipalityCode: "0860" })).toMatchObject({ buildingCaseArchiveUrl: null, sewerSeparationLookupUrl: "https://hjoerring.dk/" });
  });

  it("gives no municipality links for an unknown or missing code, instead of a guessed one", () => {
    for (const municipalityCode of ["0101", null]) {
      expect(buildAddressRiskFlags({ ...base, municipalityCode })).toMatchObject({ buildingCaseArchiveUrl: null, sewerSeparationLookupUrl: null });
    }
  });

  it("points at the land register's entry page and keeps the check advisory", () => {
    expect(buildAddressRiskFlags(base)).toMatchObject({ encumbranceLookupUrl: "https://www.tinglysning.dk/", encumbranceCheckRequired: true, sewerSeparationCheckRequired: true });
  });

  it("does not claim a soil result, and has no parcel to build an attest link from", () => {
    const flags = buildAddressRiskFlags(base);
    expect(flags.soilContamination).toEqual({ classification: "unknown", jordart: null });
    expect(flags.soilContaminationAttestUrl).toBeNull();
    expect(riskStatuses(flags).soil).toBe("unknown");
  });
});

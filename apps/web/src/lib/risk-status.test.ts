import { describe, expect, it } from "vitest";
import { overallRisk, riskStatuses } from "@shared/utils/risk-status";
import type { RiskFlags } from "@shared/types/index";

const flags: RiskFlags = {
  noiseExposureLden: 45, encumbranceCheckRequired: true, encumbranceLookupUrl: null,
  sewerSeparationCheckRequired: true, sewerSeparationLookupUrl: null, oilTankRisk: false,
  oilTankRiskSource: "bbr", soilContamination: { classification: "none", jordart: null },
  soilContaminationAttestUrl: null,
};

describe("unknown register risks in cards and checklists", () => {
  it("never displays missing noise as quiet or a green card", () => {
    expect(riskStatuses({ ...flags, noiseExposureLden: null }).noise).toBe("unknown");
    expect(overallRisk({ ...flags, noiseExposureLden: null })).toBe("unknown");
    expect(overallRisk(null)).toBe("unknown");
  });
  it("never treats a negative building-age oil heuristic as verified absence", () => {
    expect(riskStatuses({ ...flags, oilTankRiskSource: "heuristic" }).oilTank).toBe("unknown");
    expect(overallRisk({ ...flags, oilTankRiskSource: "heuristic" })).toBe("unknown");
  });
  it("retains warnings alongside unknown facts", () => {
    expect(overallRisk({ ...flags, noiseExposureLden: null, oilTankRisk: true })).toBe("warning");
    expect(overallRisk({ ...flags, soilContamination: { classification: "unknown", jordart: null } })).toBe("unknown");
  });
  it("only shows known below-threshold measurements as clear", () => {
    expect(overallRisk(flags)).toBe("ok");
    expect(overallRisk({ ...flags, noiseExposureLden: 63 })).toBe("warning");
  });
});

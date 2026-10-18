import { describe, expect, it } from "vitest";
import { landStatus, overallRisk, riskStatuses, standingTanks } from "@shared/utils/risk-status";
import type { RiskFlags } from "@shared/types/index";

const flags: RiskFlags = {
  noiseExposureLden: 45, encumbranceCheckRequired: true, encumbranceLookupUrl: null,
  sewerSeparationCheckRequired: true, sewerSeparationLookupUrl: null, buildingCaseArchiveUrl: null, oilTankRisk: false,
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

const noLand = {
  totalAreaSqm: 812, parcelCount: 1, forestReserve: null, beachProtection: null, duneProtection: null,
  entailedForest: false, agriculturalNote: null, commonLot: false, condominiumParent: false,
};
const tank = {
  sizeLiters: 1500, manufacturedYear: 1978, installedYear: 1978, decommissionDeadline: "2028-12-31", decommissionedYear: null,
  decommissioned: false, inOperation: true, placementCode: null, contentCode: null,
};

describe("Matriklen findings", () => {
  it("is unknown until MAT has been asked, so an older row keeps its overall answer", () => {
    expect(landStatus(flags)).toBe("unknown");
    expect(landStatus(null)).toBe("unknown");
    expect(overallRisk(flags)).toBe("ok");
  });
  it("is ok for registered land with nothing restricting it", () => {
    expect(landStatus({ ...flags, landRegistration: noLand })).toBe("ok");
    expect(overallRisk({ ...flags, landRegistration: noLand })).toBe("ok");
  });
  it("warns for forest reserve, beach or dune protection, entailed forest and a farmland note", () => {
    for (const land of [
      { ...noLand, forestReserve: { areaSqm: 300 } },
      { ...noLand, beachProtection: { areaSqm: 10 } },
      { ...noLand, duneProtection: { areaSqm: 10 } },
      { ...noLand, entailedForest: true },
      { ...noLand, agriculturalNote: "Landbrug" },
    ]) {
      expect(landStatus({ ...flags, landRegistration: land })).toBe("warning");
    }
    expect(overallRisk({ ...flags, landRegistration: { ...noLand, forestReserve: { areaSqm: 300 } } })).toBe("warning");
  });
});

describe("tanks BBR registers", () => {
  it("counts only standing tanks, and those past their deadline", () => {
    const withTanks = { ...flags, oilTanks: { tanks: [tank, { ...tank, decommissioned: true }, { ...tank, decommissionDeadline: "2020-01-01" }, { ...tank, decommissionDeadline: null }] } };
    expect(standingTanks(withTanks, "2026-10-18")).toEqual({ count: 3, overdue: 1 });
    expect(standingTanks(flags)).toEqual({ count: 0, overdue: 0 });
    expect(standingTanks(null)).toEqual({ count: 0, overdue: 0 });
  });
});

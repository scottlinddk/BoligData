import type { RiskFlags } from "../types/index.js";

export type RiskStatus = "ok" | "warning" | "unknown";

/** Missing measurements and negative heuristics are not evidence of safety. */
export function riskStatuses(flags: RiskFlags | null): { noise: RiskStatus; oilTank: RiskStatus; soil: RiskStatus } {
  if (!flags) return { noise: "unknown", oilTank: "unknown", soil: "unknown" };
  const measuredNoise = typeof flags.noiseExposureLden === "number" && Number.isFinite(flags.noiseExposureLden);
  const soil = flags.soilContamination?.classification;
  return {
    noise: !measuredNoise ? "unknown" : flags.noiseExposureLden! > 58 ? "warning" : "ok",
    oilTank: flags.oilTankRisk === true ? "warning" : flags.oilTankRisk === false && flags.oilTankRiskSource === "bbr" ? "ok" : "unknown",
    soil: soil === "v1" || soil === "v2" ? "warning" : soil === "none" ? "ok" : "unknown",
  };
}

export function overallRisk(flags: RiskFlags | null): RiskStatus {
  const statuses = Object.values(riskStatuses(flags));
  return statuses.includes("warning") ? "warning" : statuses.includes("unknown") ? "unknown" : "ok";
}

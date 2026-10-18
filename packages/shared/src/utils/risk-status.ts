import type { RiskFlags } from "../types/index.js";

export type RiskStatus = "ok" | "warning" | "unknown";

/** Miljøstyrelsen's guideline for road noise at a home's facade, Lden in dB. */
export const NOISE_GUIDELINE_LDEN = 58;

/**
 * A mapped band reaching above the guideline is a warning (every EU band, 55–59 and up, does). The maps
 * having been asked with no band covering the point is "ok": not in a mapped noise zone. Not asked is unknown.
 */
export function noiseStatus(flags: RiskFlags): RiskStatus {
  if (flags.noiseBand) return (flags.noiseBand.upperDb ?? Infinity) > NOISE_GUIDELINE_LDEN ? "warning" : "ok";
  if (flags.noiseChecked === true) return "ok";
  const measured = typeof flags.noiseExposureLden === "number" && Number.isFinite(flags.noiseExposureLden);
  return !measured ? "unknown" : flags.noiseExposureLden! > NOISE_GUIDELINE_LDEN ? "warning" : "ok";
}

/** Missing measurements and negative heuristics are not evidence of safety. */
export function riskStatuses(flags: RiskFlags | null): { noise: RiskStatus; oilTank: RiskStatus; soil: RiskStatus } {
  if (!flags) return { noise: "unknown", oilTank: "unknown", soil: "unknown" };
  const soil = flags.soilContamination?.classification;
  return {
    noise: noiseStatus(flags),
    oilTank: flags.oilTankRisk === true ? "warning" : flags.oilTankRisk === false && flags.oilTankRiskSource === "bbr" ? "ok" : "unknown",
    soil: soil === "v1" || soil === "v2" ? "warning" : soil === "none" ? "ok" : "unknown",
  };
}

export function overallRisk(flags: RiskFlags | null): RiskStatus {
  const statuses = Object.values(riskStatuses(flags));
  return statuses.includes("warning") ? "warning" : statuses.includes("unknown") ? "unknown" : "ok";
}

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

/**
 * Matriklen's findings. A warning is anything that limits what the owner may do with the land: forest reserve,
 * beach or dune protection, entailed forest, or a farmland note (a duty to farm). Not asked is unknown, since an
 * older row or a failed register says nothing about the land.
 */
export function landStatus(flags: RiskFlags | null): RiskStatus {
  const land = flags?.landRegistration;
  if (!land) return "unknown";
  return land.forestReserve || land.beachProtection || land.duneProtection || land.entailedForest || land.agriculturalNote ? "warning" : "ok";
}

/** Whether the tank register registers a tank still standing, and whether one is past its decommissioning deadline. */
export function standingTanks(flags: RiskFlags | null, today = new Date().toISOString().slice(0, 10)): { count: number; overdue: number } {
  const standing = (flags?.oilTanks?.tanks ?? []).filter((tank) => !tank.decommissioned);
  return { count: standing.length, overdue: standing.filter((tank) => tank.decommissionDeadline !== null && tank.decommissionDeadline < today).length };
}

export function overallRisk(flags: RiskFlags | null): RiskStatus {
  // Land is part of the picture only once it was asked, so a row written before it existed keeps its old answer.
  const statuses = [...Object.values(riskStatuses(flags)), ...(flags?.landRegistration ? [landStatus(flags)] : [])];
  return statuses.includes("warning") ? "warning" : statuses.includes("unknown") ? "unknown" : "ok";
}

import type { RiskFlags } from "../types/index.js";
import { landStatus, noiseStatus, standingTanks } from "./risk-status.js";

export interface DueDiligenceDeduction {
  label: string;
  points: number;
}

export interface DueDiligenceScoreBreakdown {
  /** 0-10, one decimal; null when there's no enrichment data to score yet. */
  score: number | null;
  deductions: DueDiligenceDeduction[];
}

/**
 * Quick 0-10 buy/inspect-further indicator combining the due-diligence risk
 * flags with how the asking price compares to recent comparable sales.
 * Deliberately excludes the always-true advisory flags
 * (encumbranceCheckRequired, sewerSeparationCheckRequired) — those reflect
 * "no automated source, check yourself" rather than a real signal about
 * *this* property, and would flatten every property to the same deduction.
 */
export function calculateDueDiligenceScore(
  riskFlags: RiskFlags | null,
  pricePerSqm: number,
  neighborhoodAvgPricePerSqm: number | null,
): DueDiligenceScoreBreakdown {
  if (riskFlags === null) return { score: null, deductions: [] };

  const deductions: DueDiligenceDeduction[] = [];

  if (noiseStatus(riskFlags) === "warning") {
    deductions.push({ label: "noise", points: 1.5 });
  }

  const soilClassification = riskFlags.soilContamination?.classification ?? "unknown";
  if (soilClassification === "v2") deductions.push({ label: "soilV2", points: 2 });
  else if (soilClassification === "v1") deductions.push({ label: "soilV1", points: 1 });
  else if (soilClassification === "unknown") deductions.push({ label: "soilUnknown", points: 0.25 });

  if (riskFlags.oilTankRisk) {
    deductions.push({
      label: "oilTank",
      points: riskFlags.oilTankRiskSource === "bbr" ? 1.5 : 1,
    });
  }
  // A registered tank past its decommissioning deadline is a cost and a liability on top of the tank itself.
  if (standingTanks(riskFlags).overdue > 0) deductions.push({ label: "oilTankOverdue", points: 1 });

  if (landStatus(riskFlags) === "warning") {
    const land = riskFlags.landRegistration!;
    if (land.forestReserve || land.beachProtection || land.duneProtection || land.entailedForest) deductions.push({ label: "landProtection", points: 1 });
    if (land.agriculturalNote) deductions.push({ label: "farmland", points: 0.5 });
  }

  if (neighborhoodAvgPricePerSqm !== null && neighborhoodAvgPricePerSqm > 0) {
    const deviation = (pricePerSqm - neighborhoodAvgPricePerSqm) / neighborhoodAvgPricePerSqm;
    if (deviation > 0.3) deductions.push({ label: "priceHigh", points: 2 });
    else if (deviation > 0.15) deductions.push({ label: "priceHigh", points: 1 });
  }

  const totalDeduction = deductions.reduce((sum, d) => sum + d.points, 0);
  const score = Math.max(0, Math.min(10, Math.round((10 - totalDeduction) * 10) / 10));

  return { score, deductions };
}

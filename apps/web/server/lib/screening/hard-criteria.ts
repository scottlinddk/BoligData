import type {
  RenovationCategory,
  RoomCountDefinition,
  ScreeningCriterionResult,
  ScreeningSymbol,
} from "../../../../../packages/shared/src/types/property-lookup.js";
import { DEFAULT_FINANCING_ASSUMPTIONS, type FinancingAssumptions } from "./config/financing-assumptions.js";

/**
 * The seven hard criteria from the house-buying decision rule, as
 * independent pure functions rather than one conditional — each is
 * separately testable and each returns a reason string, not just a
 * pass/fail, since both the daily screening output and the full analysis
 * need the "why". Every result carries `source: "ai"`.
 */

function fmtDkk(n: number): string {
  return `${Math.round(n).toLocaleString("da-DK")} kr.`;
}

// Rough monthly utility estimate by BBR energy label; used only as a
// fallback signal for checkMonthlyCost until real forbrug data exists.
const ENERGY_LABEL_MONTHLY_UTILITY_DKK: Record<string, number> = {
  A: 800,
  B: 1000,
  C: 1300,
  D: 1700,
  E: 2200,
  F: 2800,
  G: 3500,
};

function monthlyMortgagePayment(principalDkk: number, annualRate: number, years = 30): number {
  if (principalDkk <= 0) return 0;
  const monthlyRate = annualRate / 12;
  const totalMonths = years * 12;
  return (principalDkk * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -totalMonths));
}

export function checkPriceCeiling(
  askingPrice: number,
  renovationCategory: RenovationCategory,
  renovationCategoryIsEstimate: boolean,
  assumptions: FinancingAssumptions = DEFAULT_FINANCING_ASSUMPTIONS,
): ScreeningCriterionResult {
  const ceiling = assumptions.priceCeilingByRenovationCategory[renovationCategory];
  const passed = askingPrice <= ceiling;
  const symbol: ScreeningSymbol = passed ? (renovationCategoryIsEstimate ? "⚠️" : "✅") : "❌";
  const estimateNote = renovationCategoryIsEstimate ? " — renovation category is an estimate, not a confirmed tilstandsrapport read" : "";
  return {
    key: "priceCeiling",
    passed,
    symbol,
    reason: `Asking price ${fmtDkk(askingPrice)} vs. category ${renovationCategory} ceiling ${fmtDkk(ceiling)}${estimateNote}`,
    source: "ai",
  };
}

/**
 * Modelled monthly cost = mortgage (Model B: realkredit-only on the
 * post-down-payment principal) + a grundskyld estimate + an energy-label
 * utility estimate. The grundskyld estimate assumes land value is ~30% of
 * asking price pending a real land-value input (ejendomsvurdering's
 * assessedLandValueDkk, once wired through) — a placeholder, not the real
 * offentlig vurdering.
 */
export function checkMonthlyCost(
  askingPrice: number,
  energyLabel: string | null,
  assumptions: FinancingAssumptions = DEFAULT_FINANCING_ASSUMPTIONS,
): ScreeningCriterionResult {
  const loanAmount = Math.max(0, askingPrice - assumptions.downPaymentDkk);
  const mortgageMonthly = monthlyMortgagePayment(loanAmount, assumptions.effectiveInterestRate);
  const grundskyldMonthly = (askingPrice * 0.3 * assumptions.grundskyldPromille) / 1000 / 12;
  const utilityMonthly = ENERGY_LABEL_MONTHLY_UTILITY_DKK[energyLabel?.toUpperCase() ?? ""] ?? ENERGY_LABEL_MONTHLY_UTILITY_DKK.D!;
  const totalMonthly = mortgageMonthly + grundskyldMonthly + utilityMonthly;
  const passed = totalMonthly <= assumptions.maxMonthlyCostDkk;

  return {
    key: "monthlyCost",
    passed,
    symbol: passed ? "✅" : "❌",
    reason: `Estimated monthly cost ${fmtDkk(totalMonthly)} (mortgage + grundskyld + energy label ${energyLabel ?? "unknown"} utility estimate) vs. ceiling ${fmtDkk(assumptions.maxMonthlyCostDkk)}`,
    source: "ai",
  };
}

export function checkArea(
  areaSqm: number | null,
  assumptions: FinancingAssumptions = DEFAULT_FINANCING_ASSUMPTIONS,
): ScreeningCriterionResult {
  if (areaSqm === null) {
    return { key: "area", passed: false, symbol: "~", reason: "No area data available", source: "ai" };
  }
  const passed = areaSqm >= assumptions.minAreaSqm;
  return {
    key: "area",
    passed,
    symbol: passed ? "✅" : "❌",
    reason: `${areaSqm} m² vs. minimum ${assumptions.minAreaSqm} m²`,
    source: "ai",
  };
}

export function checkRooms(
  roomCount: number | null,
  definition: RoomCountDefinition = "B",
  assumptions: FinancingAssumptions = DEFAULT_FINANCING_ASSUMPTIONS,
): ScreeningCriterionResult {
  if (roomCount === null) {
    return { key: "rooms", passed: false, symbol: "~", reason: "No room count available", source: "ai" };
  }
  const minRooms = assumptions.minRoomsByDefinition[definition];
  const passed = roomCount >= minRooms;
  return {
    key: "rooms",
    passed,
    symbol: passed ? "✅" : "❌",
    reason: `${roomCount} rooms (definition ${definition}) vs. minimum ${minRooms}`,
    source: "ai",
  };
}

export function checkTakeoverDate(
  sellerTakeoverDate: string | null,
  assumptions: FinancingAssumptions = DEFAULT_FINANCING_ASSUMPTIONS,
): ScreeningCriterionResult {
  if (sellerTakeoverDate === null) {
    return { key: "takeoverDate", passed: false, symbol: "~", reason: "No seller takeover date provided", source: "ai" };
  }
  if (assumptions.latestAcceptableTakeoverDate === null) {
    return {
      key: "takeoverDate",
      passed: false,
      symbol: "~",
      reason: "No takeover deadline configured yet (SCREENING_LATEST_TAKEOVER_DATE)",
      source: "ai",
    };
  }
  const passed = new Date(sellerTakeoverDate).getTime() <= new Date(assumptions.latestAcceptableTakeoverDate).getTime();
  return {
    key: "takeoverDate",
    passed,
    symbol: passed ? "✅" : "❌",
    reason: `Seller takeover ${sellerTakeoverDate} vs. latest acceptable ${assumptions.latestAcceptableTakeoverDate}`,
    source: "ai",
  };
}

/**
 * Encumbrances have no open API (tinglysning.dk) — see tinglysning-link.ts.
 * This only screens a ratio the caller already pulled manually from a
 * tingbogsattest; it never resolves totalEncumbrancesDkk itself.
 */
export function checkEncumbranceRatio(
  totalEncumbrancesDkk: number | null,
  askingPrice: number,
  assumptions: FinancingAssumptions = DEFAULT_FINANCING_ASSUMPTIONS,
): ScreeningCriterionResult {
  if (totalEncumbrancesDkk === null) {
    return {
      key: "encumbranceRatio",
      passed: false,
      symbol: "~",
      reason: "Encumbrances aren't available from any automated source — pull the tingbogsattest manually",
      source: "ai",
    };
  }
  const ratio = askingPrice > 0 ? totalEncumbrancesDkk / askingPrice : 0;
  const passed = ratio <= assumptions.maxEncumbranceRatio;
  return {
    key: "encumbranceRatio",
    passed,
    symbol: passed ? "✅" : "❌",
    reason: `Encumbrances ${fmtDkk(totalEncumbrancesDkk)} = ${(ratio * 100).toFixed(1)}% of asking price vs. ceiling ${(assumptions.maxEncumbranceRatio * 100).toFixed(1)}%`,
    source: "ai",
  };
}

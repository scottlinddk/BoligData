import type { RenovationCategory, RoomCountDefinition } from "../../../../../../packages/shared/src/types/property-lookup.js";

/**
 * Every threshold in this file is a **placeholder** pending confirmation
 * against the current house-buying decision rule (v3 project instructions).
 * They live in one file, isolated from `hard-criteria.ts`'s rule logic, so
 * updating a number (already happened once — the down-payment model moved
 * from a flat 5% to a proceeds-based amount) never requires touching a rule
 * function. Override any of them via env var without a redeploy of logic.
 */
export interface FinancingAssumptions {
  /** Cash down payment available at takeover (DKK), Model B: proceeds from the current home sale, not a flat 5%. */
  downPaymentDkk: number;
  /** All-in effective interest rate on the realkredit loan (e.g. 0.029 = 2.9%). */
  effectiveInterestRate: number;
  /** Municipal grundskyld rate, promille of the land value. */
  grundskyldPromille: number;
  /** Asking-price ceiling (DKK) per renovation category — stricter for categories needing more post-purchase work. */
  priceCeilingByRenovationCategory: Record<RenovationCategory, number>;
  /** Maximum acceptable modelled monthly housing cost (DKK): mortgage + grundskyld + a boligejerforsikring/ejerudgift estimate. */
  maxMonthlyCostDkk: number;
  /** Minimum livable area (sqm). */
  minAreaSqm: number;
  /** Minimum room count, keyed by which counting definition (A/B/C) the caller selects. */
  minRoomsByDefinition: Record<RoomCountDefinition, number>;
  /** Latest acceptable seller takeover date (ISO date), or null when no deadline is configured yet. */
  latestAcceptableTakeoverDate: string | null;
  /** Maximum acceptable ratio of total registered encumbrances to asking price. */
  maxEncumbranceRatio: number;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function envDateOrNull(name: string, fallback: string | null): string | null {
  const raw = process.env[name];
  return raw === undefined || raw === "" ? fallback : raw;
}

export const DEFAULT_FINANCING_ASSUMPTIONS: FinancingAssumptions = {
  downPaymentDkk: envNumber("SCREENING_DOWN_PAYMENT_DKK", 965_000),
  effectiveInterestRate: envNumber("SCREENING_EFFECTIVE_INTEREST_RATE", 0.029),
  grundskyldPromille: envNumber("SCREENING_GRUNDSKYLD_PROMILLE", 16),
  priceCeilingByRenovationCategory: {
    // TODO(scott): confirm real per-category ceilings against the v3 decision rule.
    A: envNumber("SCREENING_PRICE_CEILING_A", 3_500_000),
    B: envNumber("SCREENING_PRICE_CEILING_B", 3_200_000),
    C: envNumber("SCREENING_PRICE_CEILING_C", 2_900_000),
    D: envNumber("SCREENING_PRICE_CEILING_D", 2_600_000),
  },
  maxMonthlyCostDkk: envNumber("SCREENING_MAX_MONTHLY_COST_DKK", 15_000),
  minAreaSqm: envNumber("SCREENING_MIN_AREA_SQM", 120),
  minRoomsByDefinition: {
    // TODO(scott): confirm final room-count definition; "B" is the current working default (see property-lookup-endpoint plan §4).
    A: envNumber("SCREENING_MIN_ROOMS_A", 4),
    B: envNumber("SCREENING_MIN_ROOMS_B", 5),
    C: envNumber("SCREENING_MIN_ROOMS_C", 6),
  },
  latestAcceptableTakeoverDate: envDateOrNull("SCREENING_LATEST_TAKEOVER_DATE", null),
  maxEncumbranceRatio: envNumber("SCREENING_MAX_ENCUMBRANCE_RATIO", 0.05),
};

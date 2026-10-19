/**
 * Estimated boligskat for buyers after 1 Jan 2024 (ejendomsværdiskat plus grundskyld).
 * Derived, not official, and it excludes the transitional rebate for owners from before 2024.
 *
 * Only the fixture in boligskat.test.ts (Maren Hemmings Vej 11: 16.255 / 12.290 / 28.545 kr.)
 * pins these numbers. The rates below come from search summaries of Vurderingsstyrelsen
 * material and have not been checked against the primary pages, so they live in a versioned
 * config rather than in the function. Where the 9.2 mio. progression limit applies (before or
 * after the 20 % deduction) is an assumption, listed in `assumptions`.
 */
export interface BoligskatRates {
  ratesVersion: string;
  /** Share of ejendomsværdi that is taxed (1 - 20 % deduction). */
  taxableShare: number;
  ejendomsvaerdiskatRate: number;
  progressionLimitDkk: number;
  ejendomsvaerdiskatRateAboveLimit: number;
}

export const BOLIGSKAT_RATES_2024: BoligskatRates = {
  ratesVersion: "boligskat-2024-v1",
  taxableShare: 0.8,
  ejendomsvaerdiskatRate: 0.0051,
  progressionLimitDkk: 9_200_000,
  ejendomsvaerdiskatRateAboveLimit: 0.014,
};

export interface BoligskatInput {
  ejendomsvaerdiDkk: number | null;
  grundvaerdiDkk: number | null;
  /** Municipal grundskyld in promille (per mille of grundværdi). Null when unknown. */
  grundskyldPromille: number | null;
}

export type BoligskatUnavailableReason = "missing_ejendomsvaerdi" | "missing_grundvaerdi" | "missing_grundskyld_promille";

export interface BoligskatEstimate {
  isEstimate: true;
  ratesVersion: string;
  ejendomsvaerdiskatDkk: number | null;
  grundskyldDkk: number | null;
  /** Null unless both parts could be estimated. A partial sum would understate the tax. */
  totalDkk: number | null;
  unavailable: BoligskatUnavailableReason[];
  assumptions: string[];
}

const valid = (value: number | null): value is number => value != null && Number.isFinite(value) && value > 0;

export function estimateBoligskat(input: BoligskatInput, rates: BoligskatRates = BOLIGSKAT_RATES_2024): BoligskatEstimate {
  const unavailable: BoligskatUnavailableReason[] = [];
  let ejendomsvaerdiskatDkk: number | null = null;
  let grundskyldDkk: number | null = null;

  if (valid(input.ejendomsvaerdiDkk)) {
    const value = input.ejendomsvaerdiDkk;
    const base = Math.min(value, rates.progressionLimitDkk);
    const above = Math.max(0, value - rates.progressionLimitDkk);
    ejendomsvaerdiskatDkk = Math.round(
      (base * rates.ejendomsvaerdiskatRate + above * rates.ejendomsvaerdiskatRateAboveLimit) * rates.taxableShare,
    );
  } else unavailable.push("missing_ejendomsvaerdi");

  if (!valid(input.grundvaerdiDkk)) unavailable.push("missing_grundvaerdi");
  if (!valid(input.grundskyldPromille)) unavailable.push("missing_grundskyld_promille");
  if (valid(input.grundvaerdiDkk) && valid(input.grundskyldPromille)) {
    grundskyldDkk = Math.round(input.grundvaerdiDkk * input.grundskyldPromille / 1000);
  }

  return {
    isEstimate: true,
    ratesVersion: rates.ratesVersion,
    ejendomsvaerdiskatDkk,
    grundskyldDkk,
    totalDkk: ejendomsvaerdiskatDkk != null && grundskyldDkk != null ? ejendomsvaerdiskatDkk + grundskyldDkk : null,
    unavailable,
    assumptions: [
      "Buyers after 1 Jan 2024. Excludes the transitional rebate for earlier owners.",
      "Preliminary valuations are indexed and can change when final valuations arrive.",
      "The progression limit is applied to ejendomsværdi before the 20 % deduction (unverified).",
    ],
  };
}

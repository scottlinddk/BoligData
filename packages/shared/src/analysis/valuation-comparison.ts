/**
 * Compares an asking price with the public ejendomsværdi. Only ejendomsværdi is comparable to a
 * price: grundværdi is just the land part and the two must never be added. Vurderingsstyrelsen's
 * standard tolerates roughly +/-20 % against recorded sale prices (search summary, unverified
 * against the primary page), so a smaller gap is not a signal on its own.
 */
export const VALUATION_TOLERANCE_RATIO = 0.2;

export type ValuationKind = "foreloebig" | "endelig";
/** Property types where the valuation is a weaker reference, so no verdict is given. */
export type ValuationPoorFitType = "lejlighed" | "nybyg" | "fritidshus";
export type ValuationBand = "within" | "above" | "below";
export type ValuationComparisonUnavailableReason =
  | "missing_asking_price" | "missing_ejendomsvaerdi" | "poor_property_fit";

export interface ValuationComparisonInput {
  askingPrice: number | null;
  ejendomsvaerdi: number | null;
  /** Null when the source does not say. Never guessed. */
  kind: ValuationKind | null;
  year: number | null;
  propertyType?: ValuationPoorFitType | string | null;
}

export type ValuationComparison =
  | { status: "unavailable"; reason: ValuationComparisonUnavailableReason }
  | {
      status: "available";
      differenceDkk: number;
      /** (asking - ejendomsværdi) / ejendomsværdi. Positive means asking above valuation. */
      ratio: number;
      percent: number;
      band: ValuationBand;
      toleranceRatio: number;
      /** False when kind or year is unknown, so the UI must show the vintage as unknown. */
      vintageKnown: boolean;
      kind: ValuationKind | null;
      year: number | null;
    };

const POOR_FIT = new Set<string>(["lejlighed", "nybyg", "fritidshus"]);
const positive = (value: number | null): value is number => value != null && Number.isFinite(value) && value > 0;

export function compareAskingToValuation(input: ValuationComparisonInput): ValuationComparison {
  if (!positive(input.askingPrice)) return { status: "unavailable", reason: "missing_asking_price" };
  if (!positive(input.ejendomsvaerdi)) return { status: "unavailable", reason: "missing_ejendomsvaerdi" };
  if (input.propertyType && POOR_FIT.has(input.propertyType)) return { status: "unavailable", reason: "poor_property_fit" };

  const differenceDkk = input.askingPrice - input.ejendomsvaerdi;
  const ratio = differenceDkk / input.ejendomsvaerdi;
  return {
    status: "available",
    differenceDkk,
    ratio,
    percent: Math.round(ratio * 1000) / 10,
    band: Math.abs(ratio) <= VALUATION_TOLERANCE_RATIO ? "within" : ratio > 0 ? "above" : "below",
    toleranceRatio: VALUATION_TOLERANCE_RATIO,
    vintageKnown: input.kind != null && input.year != null,
    kind: input.kind,
    year: input.year,
  };
}

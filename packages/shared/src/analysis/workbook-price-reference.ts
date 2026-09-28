import snapshot from "../data/liggetid-price-reference-2026-09-27.json" with { type: "json" };

export interface WorkbookPriceReferenceBracket {
  sourceRange: string;
  label: string;
  count: number;
  medianDiscountFraction: number;
  meanDiscountFraction: number;
  q1DiscountFraction: number;
  q3DiscountFraction: number;
  sensitivityCount: number;
  sensitivityMedianDiscountFraction: number;
  fromDays: number;
  toDays: number;
}

export type WorkbookPriceReferenceMetadata = typeof snapshot.metadata;
export interface WorkbookPriceReferenceModel {
  metadata: WorkbookPriceReferenceMetadata;
  brackets: readonly WorkbookPriceReferenceBracket[];
}

/** The compact, independently reconciled model; raw transaction evidence stays out of the browser bundle. */
export const WORKBOOK_PRICE_REFERENCE_MODEL: WorkbookPriceReferenceModel = snapshot;
export const WORKBOOK_PRICE_REFERENCE_METADATA = WORKBOOK_PRICE_REFERENCE_MODEL.metadata;

export interface WorkbookPriceReferenceInput {
  /** First asking price of the relevant journey, never a fallback to today's price.
   * Callers must label any source-percentage reconstruction as an approximate scenario. */
  firstAsking: number | null;
  currentAsking: number | null;
  /** Latest listing episode only. Do not substitute cumulative active days or technical first_seen. */
  latestEpisodeDays: number | null;
  propertyType: string | null;
  postalCode: string | null;
}

export type WorkbookPriceReferenceStatus =
  | "available"
  | "missing_first_asking"
  | "missing_days"
  | "outside_observed_range"
  | "outside_scope"
  | "insufficient_sample"
  | "invalid_model";

export interface WorkbookPriceReferenceResult {
  status: WorkbookPriceReferenceStatus;
  /** Scope is disclosed, never confused with locally matched comparable sales. */
  applicability: "sample_scope" | "broad_scenario";
  reason: string | null;
  referencePrice: number | null;
  /** Lower price uses Q3 of discount; upper price uses Q1. */
  lowerPrice: number | null;
  upperPrice: number | null;
  /** Current asking minus historical reference; negative values are deliberately preserved. */
  gapAmount: number | null;
  /** Percentage points relative to CURRENT asking, e.g. 7.69 for 400,000 / 5,200,000. */
  gapPercent: number | null;
  medianDiscountPercent: number | null;
  bracket: WorkbookPriceReferenceBracket | null;
  metadata: WorkbookPriceReferenceMetadata;
}

const validPrice = (price: number | null): price is number =>
  price !== null && Number.isFinite(price) && price > 0;

/**
 * Historical workbook reference, not a valuation or asking-price forecast.
 *
 * Both bracket endpoints are inclusive. Prices follow Excel ROUND(x / step, 0)
 * for positive amounts. Negative discounts (sales above asking) remain intact.
 * Property type/postcode describe applicability, not availability: outside the
 * workbook's sample this is explicitly a broad historical scenario.
 */
export function calculateWorkbookPriceReference(
  input: WorkbookPriceReferenceInput,
  model: WorkbookPriceReferenceModel = WORKBOOK_PRICE_REFERENCE_MODEL,
): WorkbookPriceReferenceResult {
  const metadata = model.metadata;
  const withinSampleScope = metadata.propertyTypes.includes(input.propertyType?.trim().toLowerCase() ?? "")
    && metadata.postalCodes.includes(input.postalCode?.trim() ?? "");
  const empty: WorkbookPriceReferenceResult = {
    status: "available", applicability: withinSampleScope ? "sample_scope" : "broad_scenario", reason: null, referencePrice: null, lowerPrice: null,
    upperPrice: null, gapAmount: null, gapPercent: null, medianDiscountPercent: null,
    bracket: null, metadata,
  };
  const unavailable = (status: WorkbookPriceReferenceStatus, reason: string,
    bracket: WorkbookPriceReferenceBracket | null = null): WorkbookPriceReferenceResult =>
    ({ ...empty, status, reason, bracket });

  if (input.latestEpisodeDays === null || !Number.isInteger(input.latestEpisodeDays) || input.latestEpisodeDays < 0) {
    return unavailable("missing_days", "Der mangler et dokumenteret antal dage i seneste udbudsperiode.");
  }
  if (input.latestEpisodeDays < metadata.observedMinDays || input.latestEpisodeDays > metadata.observedMaxDays) {
    return unavailable("outside_observed_range", `Liggetiden ligger uden for grundlagets ${metadata.observedMinDays}–${metadata.observedMaxDays} observerede dage.`);
  }
  const matches = model.brackets.filter((row) =>
    input.latestEpisodeDays! >= row.fromDays && input.latestEpisodeDays! <= row.toDays);
  if (matches.length !== 1) {
    return unavailable("invalid_model", "Der findes ikke én entydig liggetidsgruppe i datagrundlaget.");
  }
  const bracket = matches[0]!;
  if (!Number.isInteger(bracket.count) || bracket.count < metadata.minimumSample) {
    return unavailable("insufficient_sample", `Gruppen har færre end ${metadata.minimumSample} handler. Der vises ingen prisreference.`, bracket);
  }
  const discounts = [bracket.q1DiscountFraction, bracket.medianDiscountFraction, bracket.q3DiscountFraction];
  if (!Number.isFinite(metadata.roundingDkk) || metadata.roundingDkk <= 0
      || discounts.some((value) => !Number.isFinite(value) || value >= 1)
      || bracket.q1DiscountFraction > bracket.medianDiscountFraction
      || bracket.medianDiscountFraction > bracket.q3DiscountFraction) {
    return unavailable("invalid_model", "Datagrundlagets prisfald eller afrunding er ugyldige.", bracket);
  }
  if (!validPrice(input.firstAsking)) {
    return {
      ...unavailable("missing_first_asking", "En dokumenteret første udbudspris mangler. Dagens pris kan ikke erstatte den.", bracket),
      medianDiscountPercent: bracket.medianDiscountFraction * 100,
    };
  }
  const round = (value: number) => Math.round(value / metadata.roundingDkk) * metadata.roundingDkk;
  const referencePrice = round(input.firstAsking * (1 - bracket.medianDiscountFraction));
  const lowerPrice = round(input.firstAsking * (1 - bracket.q3DiscountFraction));
  const upperPrice = round(input.firstAsking * (1 - bracket.q1DiscountFraction));
  if (![referencePrice, lowerPrice, upperPrice].every((value) => Number.isFinite(value) && value > 0)) {
    return unavailable("invalid_model", "Prisreferencen kan ikke beregnes med de angivne beløb.", bracket);
  }
  const gapAmount = validPrice(input.currentAsking) ? input.currentAsking - referencePrice : null;
  return {
    ...empty, referencePrice, lowerPrice, upperPrice, gapAmount,
    gapPercent: gapAmount !== null && validPrice(input.currentAsking) ? gapAmount / input.currentAsking * 100 : null,
    medianDiscountPercent: bracket.medianDiscountFraction * 100, bracket,
  };
}

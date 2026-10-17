import type {
  PropertyLookupInput,
  RenovationCategory,
  RenovationCategoryResult,
  ScoringInputs,
} from "../../../../../packages/shared/src/types/property-lookup.js";
import { DEFAULT_FINANCING_ASSUMPTIONS, type FinancingAssumptions } from "../screening/config/financing-assumptions.js";

const CONDITION_PROXY_BY_CATEGORY: Record<RenovationCategory, number> = { A: 4, B: 3, C: 2, D: 1 };

export interface RelativeScoreInputsParams {
  input: PropertyLookupInput;
  areaSqm: number | null;
  renovationCategory: RenovationCategoryResult;
  noiseExposureLden: number | null;
  /** No automated source resolves this yet (no school-catchment API wired in) — pass-through, null until one exists. */
  schoolDistrictScore?: number | null;
  /** No automated source resolves this yet (needs the caller's preferred-location set) — pass-through, null until one exists. */
  locationMatch?: number | null;
  assumptions?: FinancingAssumptions;
}

/**
 * Extracts the seven weighted-category raw inputs for the relative scoring
 * model. Deliberately does not combine them into a score — weighting stays
 * a display-layer concern so weights are user-adjustable without a re-fetch.
 */
export function extractScoringInputs(params: RelativeScoreInputsParams): ScoringInputs {
  const { input, areaSqm, renovationCategory, noiseExposureLden } = params;
  const assumptions = params.assumptions ?? DEFAULT_FINANCING_ASSUMPTIONS;

  const askingPrice = input.askingPrice ?? null;
  const priceCeiling = assumptions.priceCeilingByRenovationCategory[renovationCategory.category];
  // Headroom is "ceiling minus asking price"; with no asking price there is nothing to subtract.
  const priceHeadroomDkk = askingPrice !== null ? priceCeiling - askingPrice : null;
  const areaMarginSqm = areaSqm !== null ? areaSqm - assumptions.minAreaSqm : null;
  const conditionProxy = CONDITION_PROXY_BY_CATEGORY[renovationCategory.category];

  const totalEncumbrancesDkk = input.totalEncumbrancesDkk ?? null;
  const legalRiskProxy =
    totalEncumbrancesDkk !== null && askingPrice !== null && askingPrice > 0
      ? Math.max(0, 1 - totalEncumbrancesDkk / askingPrice)
      : null;

  return {
    locationMatch: params.locationMatch ?? null,
    conditionProxy,
    priceHeadroomDkk,
    areaMarginSqm,
    schoolDistrictScore: params.schoolDistrictScore ?? null,
    noiseZoneEstimate: noiseExposureLden,
    legalRiskProxy,
    source: "ai",
  };
}

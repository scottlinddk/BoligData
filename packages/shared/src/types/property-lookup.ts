import type { BbrData, PublicValuation, ZoneStatus } from "./index.js";

/**
 * `/api/property-lookup` output. Every symbol/value here is an automated
 * read against BBR/OIS/DAR data — `source: "ai"` on every result and never
 * "verified", since verifying (encumbrances, servitutter, tilstandsrapport)
 * is a human decision this endpoint cannot make for the caller.
 */
export type ScreeningSymbol = "✅" | "⚠️" | "❌" | "~";

export type ScreeningSource = "ai";

/** Which room-count definition to screen against; "B" is the current working default. */
export type RoomCountDefinition = "A" | "B" | "C";

export type RenovationCategory = "A" | "B" | "C" | "D";

export interface ScreeningCriterionResult {
  /** Stable machine key, e.g. "priceCeiling", "monthlyCost", "area", "rooms", "takeoverDate", "encumbranceRatio". */
  key: string;
  passed: boolean;
  symbol: ScreeningSymbol;
  reason: string;
  source: ScreeningSource;
}

export interface RenovationCategoryResult {
  category: RenovationCategory;
  /** True when classified from the building-age heuristic rather than real tilstandsrapport data. */
  isEstimate: boolean;
  symbol: ScreeningSymbol;
  reason: string;
  source: ScreeningSource;
}

/**
 * Raw inputs for the relative (weighted) scoring model — deliberately not a
 * score. Weighting stays a display-layer concern so the seven weights can be
 * tuned per comparison without re-fetching data.
 */
export interface ScoringInputs {
  locationMatch: number | null;
  conditionProxy: number | null;
  priceHeadroomDkk: number | null;
  areaMarginSqm: number | null;
  schoolDistrictScore: number | null;
  noiseZoneEstimate: number | null;
  legalRiskProxy: number | null;
  source: ScreeningSource;
}

export interface PropertyLookupResolved {
  idLokalid: string | null;
  matrikelnr: string | null;
  ejerlav: string | null;
  ejerlavskode: string | null;
  zone: ZoneStatus | null;
}

export interface PropertyLookupResult {
  address: string;
  resolved: PropertyLookupResolved;
  bbrData: BbrData | null;
  publicValuation: PublicValuation | null;
  renovationCategory: RenovationCategoryResult;
  screening: ScreeningCriterionResult[];
  scoringInputs: ScoringInputs;
  source: ScreeningSource;
}

/** Everything the caller must supply that no register can resolve on its own. */
export interface PropertyLookupInput {
  address: string;
  postalCode?: string | null;
  lat?: number | null;
  lon?: number | null;
  askingPrice: number;
  sellerTakeoverDate?: string | null;
  totalEncumbrancesDkk?: number | null;
  roomCountDefinition?: RoomCountDefinition;
  /** BBR doesn't expose a whole-property room count in this codebase's lookup today — caller supplies it (e.g. from a listing) when known. */
  roomCount?: number | null;
  /** BBR's real energy-label field isn't wired into lookupBbr yet — caller supplies it (e.g. from a listing) when known; null falls back to a conservative default in checkMonthlyCost. */
  energyLabel?: string | null;
}

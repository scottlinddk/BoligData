import type { BbrData, PublicValuation, SoldPriceEntry, ZoneStatus } from "./index.js";

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
  /** DAR husnummer UUID. */
  idLokalid: string | null;
  matrikelnr: string | null;
  ejerlav: string | null;
  ejerlavskode: string | null;
  /** BFE (Bestemt Fast Ejendom) number of the parcel. */
  bfeNummer: string | null;
  zone: ZoneStatus | null;
  /** The address as the register spells it — differs from the caller's free text. */
  formattedAddress: string | null;
  postalCode: string | null;
  /** Access-point coordinates (WGS84) from the address register, or the caller's own if it supplied them. */
  lat: number | null;
  lon: number | null;
}

/**
 * Where one upstream register's contribution came from.
 * - `live` — the register answered.
 * - `mock` — that source's `*_MOCK_MODE` flag is on and the values are
 *   fabricated. Never true in a default deployment; opt-in for local dev.
 * - `unavailable` — the register was not reached (missing credential, no key
 *   to query by, upstream error); the corresponding fields are null.
 */
export type PropertyLookupDataMode = "live" | "mock" | "unavailable";

export interface PropertyLookupSourceStatus {
  key: "address" | "bbr" | "publicValuation" | "noise" | "sales";
  /** The register behind this field group, e.g. "DAR/DAWA", "BBR", "VUR". */
  register: string;
  mode: PropertyLookupDataMode;
  /** Why the source is unavailable, verbatim from the upstream error. Null when it isn't. */
  error: string | null;
}

/**
 * One recently registered sale near the subject address ("salg i nærheden").
 * `saleType` is carried rather than filtered: only `normal` is an arm's-length
 * market price, so a family transfer or a forced auction has to be visible as
 * such instead of being averaged into a neighbourhood figure.
 */
export interface NearbySaleEntry {
  address: string;
  soldDate: string;
  price: number;
  pricePerSqm: number;
  saleType: "normal" | "family" | "auction" | "other";
  areaSqm: number | null;
  propertyType: string | null;
  distanceMeters: number;
  lat: number;
  lon: number;
}

export interface PropertyLookupResult {
  address: string;
  resolved: PropertyLookupResolved;
  bbrData: BbrData | null;
  publicValuation: PublicValuation | null;
  /** Registered sales of this address, newest first — Boligsiden's "boligens historie". */
  priceHistory: SoldPriceEntry[];
  /** Recent registered sales around this address, nearest first. */
  nearbySales: NearbySaleEntry[];
  renovationCategory: RenovationCategoryResult;
  screening: ScreeningCriterionResult[];
  scoringInputs: ScoringInputs;
  /**
   * Per-register provenance. Read this before trusting any figure above: it
   * is what distinguishes a real BBR area from a fabricated one and names the
   * reason behind every null.
   */
  sources: PropertyLookupSourceStatus[];
  /**
   * Worst mode across `sources` — `live` only when every source that
   * contributed did so from its real register.
   */
  dataMode: PropertyLookupDataMode;
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

import type { BbrData, PublicValuation, SoldPriceEntry, ZoneStatus } from "./index.js";
import type { SparListingEstimate } from "./spar.js";

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
  pricePerSqm: number | null;
  saleType: "normal" | "family" | "auction" | "other";
  areaSqm: number | null;
  propertyType: string | null;
  distanceMeters: number;
  lat: number;
  lon: number;
}

/** One valuation year read from the public valuation register (VUR). */
export interface ValuationYearEntry {
  year: number;
  propertyValueDkk: number | null;
  landValueDkk: number | null;
  /** When the register registered it. Null when it gave no usable date. */
  registeredAt: string | null;
}

export interface PropertyLookupResult {
  address: string;
  resolved: PropertyLookupResolved;
  bbrData: BbrData | null;
  publicValuation: PublicValuation | null;
  /**
   * Every valuation year found for the property, oldest first. Only filled for lookups by `husnummerId`,
   * where the valuation is found from the address itself; empty otherwise.
   */
  valuationHistory: ValuationYearEntry[];
  /**
   * What the building use says the property is. `house` is the only class that gets a valuation and a fair
   * price from an address alone; `other` is an apartment building or any other use. Null when it could not
   * be determined, and for lookups that do not classify.
   */
  propertyClass: "house" | "other" | null;
  /**
   * Fair-price estimate for the address, computed from its valuation and the market level. Present only on
   * lookups by `husnummerId`. `null` means the estimate was attempted and failed, `undefined` that it was not attempted.
   */
  spar?: SparListingEstimate | null;
  /** Registered sales of this address, newest first — Boligsiden's "boligens historie". */
  priceHistory: SoldPriceEntry[];
  /**
   * How the sale history was attributed to this address, so an empty list can say why. `matched`: identified (it
   * may still be empty, the home was never sold). `not_found`: no Boligsiden address has this street, number and
   * postcode. `ambiguous`: several do (units in a building). `null`: no attribution was attempted.
   */
  priceHistoryMatch: "matched" | "not_found" | "ambiguous" | null;
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
  /** Free-text address. May be empty when `husnummerId` is given: the register's own spelling is then used. */
  address: string;
  /**
   * DAR husnummer UUID picked from the Adressevælger autocomplete. When set, the address is resolved by id
   * instead of by free text, so there is no fuzzy match to get wrong.
   */
  husnummerId?: string | null;
  postalCode?: string | null;
  lat?: number | null;
  lon?: number | null;
  /**
   * Listing price in DKK. Optional: an address looked up without a listing (a home that is not for sale) has none,
   * and the price-dependent screening criteria then report "no asking price" instead of being evaluated.
   */
  askingPrice?: number | null;
  sellerTakeoverDate?: string | null;
  totalEncumbrancesDkk?: number | null;
  roomCountDefinition?: RoomCountDefinition;
  /** BBR doesn't expose a whole-property room count in this codebase's lookup today — caller supplies it (e.g. from a listing) when known. */
  roomCount?: number | null;
  /** BBR's real energy-label field isn't wired into lookupBbr yet — caller supplies it (e.g. from a listing) when known; null falls back to a conservative default in checkMonthlyCost. */
  energyLabel?: string | null;
}

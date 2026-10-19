/**
 * Per-listing SPAR (sale price relative to the public valuation) estimate.
 * Everything here is an estimate from our own sales, never published DST data.
 */
export type SparListingStatus = "available" | "no_valuation" | "insufficient_data";

/** The fair price this home would have had in one month: its valuation times that month's smoothed market level. */
export interface SparHistoryPoint {
  /** YYYY-MM */
  period: string;
  estimate: number;
  lo80: number;
  hi80: number;
  /** The newest months are still being revised. */
  preliminary: boolean;
}

export interface SparListingEstimate {
  status: SparListingStatus;
  /** Why the estimate is missing, for status other than "available". */
  reason: "no_valuation_for_property" | "valuation_vintage_mismatch" | "too_few_sales" | "unsupported_property_type" | null;
  isUnit: boolean;
  /** Public valuation the estimate is based on. */
  valuation: { valueDkk: number; year: number; bfe: string } | null;
  /** Latest smoothed market ratio (sale price / valuation) for the property class. */
  index: {
    period: string;
    ratio: number;
    lo80: number;
    hi80: number;
    /** Sales in the latest period, and all trimmed free-trade sales behind the index. */
    nPeriod: number;
    nSales: number;
    valuationVintage: number;
    preliminary: boolean;
    /** Months from the newest index month to the as-of date. Old levels are shown with their age. */
    ageMonths: number;
    /** True when the newest index month is more than 12 months old. */
    stale: boolean;
  } | null;
  /** valuation x ratio. The band includes in-sample single-property spread, so it is a rough prediction interval. */
  fairPrice: { estimate: number; lo80: number; hi80: number; lo95: number; hi95: number } | null;
  askingPrice: number | null;
  /** asking / fair estimate - 1, as a fraction. Positive means asking above the estimate. */
  askingVsFair: number | null;
  /**
   * Fair price per month, oldest first. A re-pricing of today's valuation with each month's market
   * level, not a record of what this home was worth. Empty unless status is "available".
   */
  history: SparHistoryPoint[];
  asOf: string;
  method: "own-spar-local-level/1";
}

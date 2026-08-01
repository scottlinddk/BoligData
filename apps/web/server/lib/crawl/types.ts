import type { ListingImage, SoldPriceEntry } from "../../../../../packages/shared/src/types/index.js";

export type ListingSource = "boligsiden" | "boliga";

export interface RawListing {
  address: string;
  municipality: string;
  postal_code: string | null;
  price: number;
  sqm: number;
  listing_date: string;
  listing_source: ListingSource;
  external_id: string;
  lat: number;
  lon: number;
  status: "active" | "sold" | "withdrawn";
  building_year: number | null;
  property_type: string;
  rooms: number | null;
  images: ListingImage[];
  description: string | null;
  agent_name: string | null;
  /**
   * Absolute http(s) URL of the listing on the source site, for the detail
   * page's "go to broker listing" link. Null when the record carried nothing
   * usable — the UI hides the link rather than link to a guessed 404.
   */
  listing_url: string | null;
  /**
   * Registered sales of this address, mapped from the same Boligsiden case
   * record the rest of the listing comes from — no extra request. Empty for
   * sources that don't carry it (Boliga) and for fixture data.
   */
  sold_price_history: SoldPriceEntry[];
}

export interface SourceCrawlStats {
  source: ListingSource;
  pagesFetched: number;
  recordsSeen: number;
  /** Records that failed defensive mapping (missing/invalid required fields). */
  recordsSkipped: number;
  /**
   * Records that mapped fine but fell outside the configured zip ranges.
   * Counted apart from `recordsSkipped` because the two mean opposite
   * things operationally: this one is the filter doing its job (the default
   * range is North Jutland alone, so most of a nationwide page is expected
   * to land here), while `recordsSkipped` means the upstream shape drifted
   * and is worth investigating. Summed together they read as "899 invalid
   * records" on a run that was in fact healthy.
   */
  recordsOutOfArea: number;
  /** Non-fatal error summaries, bounded to the first few. */
  errors: string[];
}

export interface SourceCrawlResult {
  listings: RawListing[];
  stats: SourceCrawlStats;
}

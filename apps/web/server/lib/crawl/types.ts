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
   * Records dropped by the CRAWL_ZIP_RANGES filter — the crawl fetches
   * nationwide and discards what's outside the configured ranges, so this is
   * the filter working, not a failure. Counted separately from
   * recordsSkipped: with a single-region range the number dwarfs everything
   * else (899 of 1018 on 2026-08-01), and folding the two together made a
   * healthy run look like a mapper falling apart.
   */
  recordsFiltered: number;
  /** Non-fatal error summaries, bounded to the first few. */
  errors: string[];
}

export interface SourceCrawlResult {
  listings: RawListing[];
  stats: SourceCrawlStats;
}

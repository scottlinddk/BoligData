import type { ListingImage, SoldPriceEntry } from "../../../../../packages/shared/src/types/index.js";

export type ListingSource = "boligsiden" | "boliga";

export interface RawListing {
  /** Set by the fetcher; missing provenance must never count as real data. */
  data_mode?: "real" | "mock" | "demo" | "unknown";
  address: string;
  municipality: string;
  postal_code: string | null;
  price: number;
  sqm: number;
  /**
   * Null when the source record carried no parseable listing/creation date
   * (see boligsiden.ts / boliga.ts mappers). First observation is recorded
   * separately and never substitutes for a documented listing date.
   */
  listing_date: string | null;
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
  /** Provider-reported durations, observed as-is. They do not document a
   * calendar start date or independently establish continuous active time. */
  reported_time_on_market?: { latestEpisodeDays: number | null; totalDays: number | null };
  /** Rounded provider percentage, retained separately from a documented first
   * asking price. It can support an explicitly approximate price scenario. */
  reported_price_change?: { currentAsking: number; changePercent: number };
}

export interface SourceCrawlStats {
  source: ListingSource;
  /** True only after the entire requested feed has been exhausted. */
  complete?: boolean;
  dataMode?: "real" | "mock";
  pagesFetched: number;
  recordsSeen: number;
  /** Records that failed defensive mapping (missing/invalid required fields). */
  recordsSkipped: number;
  /**
   * Records positively identified as outside the configured zip ranges.
   * Boligsiden skips full mapping once a valid raw postcode proves exclusion.
   * Counted apart from `recordsSkipped` because the two mean opposite
   * things operationally: this one is the filter doing its job (the default
   * range is North Jutland alone, so most of a nationwide page is expected
   * to land here), while `recordsSkipped` means the upstream shape drifted
   * and is worth investigating. Summed together they read as "899 invalid
   * records" on a run that was in fact healthy.
   */
  recordsOutOfArea: number;
  /** Source/page failure summaries; these block successful batch progress. */
  errors: string[];
  /** Individual invalid records were skipped; valid records can still be
   * ingested. Distinct from source/page failures that block batch progress. */
  mappingWarnings?: string[];
}

export interface SourceCrawlResult {
  listings: RawListing[];
  stats: SourceCrawlStats;
}

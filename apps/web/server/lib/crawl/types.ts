import type { ListingImage } from "../../../../../packages/shared/src/types/index.js";

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
}

export interface SourceCrawlStats {
  source: ListingSource;
  pagesFetched: number;
  recordsSeen: number;
  /** Records that failed defensive mapping (missing/invalid required fields). */
  recordsSkipped: number;
  /** Non-fatal error summaries, bounded to the first few. */
  errors: string[];
}

export interface SourceCrawlResult {
  listings: RawListing[];
  stats: SourceCrawlStats;
}

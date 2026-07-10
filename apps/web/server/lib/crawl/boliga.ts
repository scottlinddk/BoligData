import type { RawListing } from "./types.js";
import fixtures from "./fixtures/boliga.sample.json" with { type: "json" };

const MOCK_MODE = process.env.CRAWL_MOCK_MODE !== "false";

/**
 * Fetches active listings from Boliga. Real scraping is not implemented
 * yet — see fixtures/boliga.sample.json for the expected RawListing shape
 * when that lands. Flip CRAWL_MOCK_MODE=false once it does.
 */
export async function fetchBoligaListings(): Promise<RawListing[]> {
  if (MOCK_MODE) {
    return fixtures as RawListing[];
  }
  throw new Error(
    "Real Boliga scraping is not implemented yet. Set CRAWL_MOCK_MODE=true or implement fetchBoligaListings().",
  );
}

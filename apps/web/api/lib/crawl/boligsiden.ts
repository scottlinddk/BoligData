import type { RawListing } from "./types.js";
import fixtures from "./fixtures/boligsiden.sample.json" assert { type: "json" };

const MOCK_MODE = process.env.CRAWL_MOCK_MODE !== "false";

/**
 * Fetches active listings from Boligsiden. Real scraping is not implemented
 * yet — see fixtures/boligsiden.sample.json for the expected RawListing
 * shape when that lands. Flip CRAWL_MOCK_MODE=false once it does.
 */
export async function fetchBoligsidenListings(): Promise<RawListing[]> {
  if (MOCK_MODE) {
    return fixtures as RawListing[];
  }
  throw new Error(
    "Real Boligsiden scraping is not implemented yet. Set CRAWL_MOCK_MODE=true or implement fetchBoligsidenListings().",
  );
}

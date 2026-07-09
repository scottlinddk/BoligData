import type { RawListing, SourceCrawlResult, SourceCrawlStats } from "./types.js";
import { envInt, fetchJson, sleep } from "./http.js";
import { logError, logEvent } from "./log.js";
import {
  asFiniteNumber,
  asIsoDate,
  asNonEmptyString,
  asPositiveInt,
  asPositiveNumber,
  asStringArray,
  dedupeByExternalId,
  isDanishCoordinate,
} from "./map-utils.js";
import fixtures from "./fixtures/boliga.sample.json" with { type: "json" };

const MOCK_MODE = process.env.CRAWL_MOCK_MODE !== "false";
const MAX_ERRORS_REPORTED = 10;

/**
 * Boliga's unofficial search API — the same JSON endpoint boliga.dk's own
 * frontend calls. Unauthenticated and undocumented: the shape may drift
 * without notice, which is why every record goes through defensive mapping
 * (skip + count, never throw) and the endpoint is env-overridable.
 */
const API_BASE = process.env.BOLIGA_API_BASE ?? "https://api.boliga.dk/api/v2/search/results";

/**
 * Boliga propertyType codes → our CHECK-constrained enum
 * (001_init_schema.sql). Unknown codes fall back to "other", so a wrong
 * guess degrades data quality but never fails an upsert.
 */
const PROPERTY_TYPE_BY_CODE: Record<number, RawListing["property_type"]> = {
  1: "villa",
  2: "terraced_house",
  3: "apartment",
  4: "summer_house",
  6: "farm",
};

interface BoligaPage {
  meta?: { totalCount?: unknown; pageCount?: unknown };
  results?: unknown[];
}

export function mapBoligaRecord(raw: unknown): RawListing | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const id = asPositiveInt(r.id) ?? asNonEmptyString(r.id);
  const price = asPositiveNumber(r.price);
  const sqm = asPositiveNumber(r.size);
  const street = asNonEmptyString(r.street);
  const lat = asFiniteNumber(r.latitude);
  const lon = asFiniteNumber(r.longitude);
  // Boliga's `municipality` field is a numeric code; `city` is the readable
  // name and close enough for our municipality column (approximation).
  const municipality = asNonEmptyString(r.city);
  if (
    id === null ||
    price === null ||
    sqm === null ||
    street === null ||
    municipality === null ||
    lat === null ||
    lon === null ||
    !isDanishCoordinate(lat, lon)
  ) {
    return null;
  }

  const zip = asPositiveInt(r.zipCode);
  const typeCode = asPositiveInt(r.propertyType);
  return {
    address: street,
    municipality,
    postal_code: zip !== null ? String(zip) : null,
    price,
    sqm,
    listing_date: asIsoDate(r.createdDate) ?? new Date().toISOString().slice(0, 10),
    listing_source: "boliga",
    external_id: String(id),
    lat,
    lon,
    status: "active",
    building_year: asPositiveInt(r.buildYear),
    property_type: (typeCode !== null && PROPERTY_TYPE_BY_CODE[typeCode]) || "other",
    rooms: asPositiveInt(r.rooms),
    image_urls: asStringArray(r.images),
    description: null,
    agent_name: null,
  };
}

/**
 * Fetches active listings from Boliga, newest first, paginated. A page
 * failure (after retries) stops pagination but returns what was collected —
 * partial data beats none; the gap is visible in stats.errors.
 */
export async function fetchBoligaListings(): Promise<SourceCrawlResult> {
  const stats: SourceCrawlStats = {
    source: "boliga",
    pagesFetched: 0,
    recordsSeen: 0,
    recordsSkipped: 0,
    errors: [],
  };

  if (MOCK_MODE) {
    return { listings: fixtures as RawListing[], stats };
  }

  const pageSize = envInt("CRAWL_PAGE_SIZE", 100, 1, 500);
  const maxPages = envInt("CRAWL_MAX_PAGES", 10, 1, 100);
  const maxListings = envInt("CRAWL_MAX_LISTINGS", 1000, 1, 50_000);
  const delayMs = envInt("CRAWL_DELAY_MS", 250, 0, 10_000);
  const municipalityCodes = (process.env.CRAWL_MUNICIPALITY_CODES ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter((code) => /^\d+$/.test(code));

  const listings: RawListing[] = [];

  for (let page = 1; page <= maxPages && listings.length < maxListings; page++) {
    if (page > 1) await sleep(delayMs);

    const params = new URLSearchParams({
      pageSize: String(pageSize),
      page: String(page),
      sort: "daysForSale-a", // newest listings first
    });
    if (municipalityCodes.length > 0) params.set("municipality", municipalityCodes.join(","));
    const url = `${API_BASE}?${params}`;

    let body: BoligaPage;
    try {
      body = await fetchJson<BoligaPage>(url);
    } catch (err) {
      logError("crawl.boliga.page_failed", err, { page });
      stats.errors.push(
        `page ${page}: ${err instanceof Error ? err.message : String(err)}`,
      );
      break;
    }

    stats.pagesFetched += 1;
    const results = Array.isArray(body.results) ? body.results : [];
    for (const record of results) {
      stats.recordsSeen += 1;
      const listing = mapBoligaRecord(record);
      if (listing === null) {
        stats.recordsSkipped += 1;
        if (stats.errors.length < MAX_ERRORS_REPORTED) {
          stats.errors.push(`page ${page}: skipped unmappable record`);
        }
        continue;
      }
      listings.push(listing);
      if (listings.length >= maxListings) break;
    }

    const pageCount = asPositiveInt(body.meta?.pageCount);
    if (pageCount !== null && page >= pageCount) break;
    // No trustworthy page count — stop when a page comes back short.
    if (pageCount === null && results.length < pageSize) break;
  }

  logEvent("crawl.boliga.fetched", { ...stats, listings: listings.length });
  return { listings: dedupeByExternalId(listings), stats };
}

import type { ListingImage } from "../../../../../packages/shared/src/types/index.js";
import type { RawListing, SourceCrawlResult, SourceCrawlStats } from "./types.js";
import { envInt, fetchJson, sleep } from "./http.js";
import { logError, logEvent } from "./log.js";
import {
  asFiniteNumber,
  asIsoDate,
  asNonEmptyString,
  asPositiveInt,
  asPositiveNumber,
  dedupeByExternalId,
  filterByZipRanges,
  getZipRanges,
  isDanishCoordinate,
} from "./map-utils.js";
import fixtures from "./fixtures/boligsiden.sample.json" with { type: "json" };

const MOCK_MODE = process.env.CRAWL_MOCK_MODE !== "false";
const MAX_ERRORS_REPORTED = 10;

/**
 * Boligsiden's unofficial search API — the same JSON endpoint boligsiden.dk's
 * own frontend calls. Unauthenticated and undocumented: the shape may drift
 * without notice, which is why every record goes through defensive mapping
 * (skip + count, never throw) and the endpoint is env-overridable.
 */
const API_BASE = process.env.BOLIGSIDEN_API_BASE ?? "https://api.boligsiden.dk/search/cases";

/** Boligsiden addressType strings → our CHECK-constrained enum (001_init_schema.sql). */
const PROPERTY_TYPE_BY_ADDRESS_TYPE: Record<string, RawListing["property_type"]> = {
  villa: "villa",
  condo: "apartment",
  ejerlejlighed: "apartment",
  "terraced house": "terraced_house",
  raekkehus: "terraced_house",
  rækkehus: "terraced_house",
  "holiday house": "summer_house",
  fritidshus: "summer_house",
  sommerhus: "summer_house",
  farm: "farm",
  landejendom: "farm",
  "villa apartment": "apartment",
};

interface BoligsidenPage {
  cases?: unknown[];
  totalHits?: unknown;
  total?: unknown;
}

function get(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/**
 * Boligsiden images carry a `category` (photo/floorplan/...) and an
 * `imageSources` array of pre-sized variants ({url, width, height}) — we
 * keep the whole set so the UI can pick the size it needs instead of only
 * ever seeing one fixed URL.
 */
function mapImage(img: unknown): ListingImage | null {
  const rawSourceItems = get(img, "imageSources");
  const sourceItems = Array.isArray(rawSourceItems) ? rawSourceItems : [];

  const sources = sourceItems
    .map((s) => {
      const url = asNonEmptyString(get(s, "url"));
      const width = asPositiveInt(get(s, "width"));
      const height = asPositiveInt(get(s, "height"));
      return url !== null && width !== null && height !== null ? { url, width, height } : null;
    })
    .filter((s): s is { url: string; width: number; height: number } => s !== null);

  // A usable image only needs *a* url — sized variants are a bonus for
  // responsive picking, not a requirement. Missing/malformed width or
  // height on every imageSources entry shouldn't drop the image entirely.
  const looseSourceUrl = sourceItems.map((s) => asNonEmptyString(get(s, "url"))).find((u) => u !== null) ?? null;
  const url = asNonEmptyString(get(img, "url")) ?? sources[0]?.url ?? looseSourceUrl ?? null;
  if (url === null) return null;

  const categoryRaw = asNonEmptyString(get(img, "category"))?.toLowerCase() ?? "";
  const category: ListingImage["category"] = categoryRaw.includes("floor")
    ? "floorplan"
    : categoryRaw === "" || categoryRaw.includes("photo") || categoryRaw.includes("image")
      ? "photo"
      : "other";

  return { url, category, sources };
}

export function mapBoligsidenCase(raw: unknown): RawListing | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const externalId = asNonEmptyString(r.caseID) ?? asNonEmptyString(r.caseId);
  const price = asPositiveNumber(r.priceCash);
  const sqm = asPositiveNumber(r.housingArea) ?? asPositiveNumber(get(r, "address", "housingArea"));
  const lat =
    asFiniteNumber(get(r, "coordinates", "lat")) ?? asFiniteNumber(get(r, "address", "coordinates", "lat"));
  const lon =
    asFiniteNumber(get(r, "coordinates", "lon")) ?? asFiniteNumber(get(r, "address", "coordinates", "lon"));

  const roadName = asNonEmptyString(get(r, "address", "roadName"));
  const houseNumber = asNonEmptyString(get(r, "address", "houseNumber"));
  const address =
    roadName !== null ? `${roadName}${houseNumber ? ` ${houseNumber}` : ""}` : asNonEmptyString(r.address);

  const municipality =
    asNonEmptyString(get(r, "address", "municipality", "name")) ??
    asNonEmptyString(r.municipalityName) ??
    asNonEmptyString(get(r, "address", "cityName"));

  if (
    externalId === null ||
    price === null ||
    sqm === null ||
    address === null ||
    municipality === null ||
    lat === null ||
    lon === null ||
    !isDanishCoordinate(lat, lon)
  ) {
    return null;
  }

  const addressType = asNonEmptyString(r.addressType)?.toLowerCase() ?? "";
  const zip = asPositiveInt(get(r, "address", "zipCode")) ?? asPositiveInt(r.zipCode);
  const images = (Array.isArray(r.images) ? r.images : [])
    .map(mapImage)
    .filter((img): img is ListingImage => img !== null);

  return {
    address,
    municipality,
    postal_code: zip !== null ? String(zip) : null,
    price,
    sqm,
    listing_date:
      asIsoDate(r.timeOnMarket) ??
      asIsoDate(get(r, "status", "createdDate")) ??
      asIsoDate(r.createdDate) ??
      new Date().toISOString().slice(0, 10),
    listing_source: "boligsiden",
    external_id: externalId,
    lat,
    lon,
    status: "active",
    building_year: asPositiveInt(get(r, "address", "buildYear")) ?? asPositiveInt(r.buildYear),
    property_type: PROPERTY_TYPE_BY_ADDRESS_TYPE[addressType] ?? "other",
    rooms: asPositiveInt(r.numberOfRooms) ?? asPositiveInt(get(r, "address", "numberOfRooms")),
    images,
    description: asNonEmptyString(r.descriptionTitle),
    agent_name: asNonEmptyString(get(r, "realtor", "name")),
  };
}

/**
 * Fetches active listings from Boligsiden, paginated. A page failure (after
 * retries) stops pagination but returns what was collected — partial data
 * beats none; the gap is visible in stats.errors.
 */
export async function fetchBoligsidenListings(): Promise<SourceCrawlResult> {
  const stats: SourceCrawlStats = {
    source: "boligsiden",
    pagesFetched: 0,
    recordsSeen: 0,
    recordsSkipped: 0,
    errors: [],
  };

  const zipRanges = getZipRanges();

  if (MOCK_MODE) {
    const all = fixtures as RawListing[];
    const { kept, excluded } = filterByZipRanges(all, zipRanges);
    stats.recordsSeen = all.length;
    stats.recordsSkipped = excluded;
    return { listings: kept, stats };
  }

  const pageSize = envInt("CRAWL_PAGE_SIZE", 100, 1, 500);
  const maxPages = envInt("CRAWL_MAX_PAGES", 10, 1, 100);
  const maxListings = envInt("CRAWL_MAX_LISTINGS", 1000, 1, 50_000);
  const delayMs = envInt("CRAWL_DELAY_MS", 250, 0, 10_000);

  const listings: RawListing[] = [];

  for (let page = 1; page <= maxPages && listings.length < maxListings; page++) {
    if (page > 1) await sleep(delayMs);

    const params = new URLSearchParams({
      per_page: String(pageSize),
      page: String(page),
      sortBy: "timeOnMarket",
      sortAscending: "true", // newest listings first
    });
    const url = `${API_BASE}?${params}`;

    let body: BoligsidenPage;
    try {
      body = await fetchJson<BoligsidenPage>(url);
    } catch (err) {
      logError("crawl.boligsiden.page_failed", err, { page });
      stats.errors.push(
        `page ${page}: ${err instanceof Error ? err.message : String(err)}`,
      );
      break;
    }

    stats.pagesFetched += 1;
    const cases = Array.isArray(body.cases) ? body.cases : [];
    for (const record of cases) {
      stats.recordsSeen += 1;
      const listing = mapBoligsidenCase(record);
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

    const total = asPositiveInt(body.totalHits) ?? asPositiveInt(body.total);
    if (total !== null && page * pageSize >= total) break;
    // No trustworthy total — stop when a page comes back short.
    if (total === null && cases.length < pageSize) break;
  }

  const { kept, excluded } = filterByZipRanges(listings, zipRanges);
  stats.recordsSkipped += excluded;

  logEvent("crawl.boligsiden.fetched", { ...stats, listings: kept.length });
  return { listings: dedupeByExternalId(kept), stats };
}

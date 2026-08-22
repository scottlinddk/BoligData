import type { ListingImage, SaleType, SoldPriceEntry } from "../../../../../packages/shared/src/types/index.js";
import type { RawListing, SourceCrawlResult, SourceCrawlStats } from "./types.js";
import { envInt, fetchJson, sleep } from "./http.js";
import { logError, logEvent } from "./log.js";
import {
  absoluteUrl,
  asFiniteNumber,
  asHttpUrl,
  asIsoDate,
  asNonEmptyString,
  asPositiveInt,
  asPositiveNumber,
  dedupeByExternalId,
  filterByZipRanges,
  getZipRanges,
  isDanishCoordinate,
  overallZipBounds,
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

/** Origin the listing link is built against, and the guard `absoluteUrl` keeps a relative slug on. */
const SITE_ORIGIN = "https://www.boligsiden.dk";

/**
 * The listing's URL on boligsiden.dk. Unlike Boliga there's no id-based route
 * to fall back on — boligsiden.dk addresses listings by slug — so this only
 * ever returns a link the record actually carried, and null otherwise. The
 * candidate field names are unverified against the live API (this repo has
 * never had network access to it), which is exactly why they're tried in
 * order and why a miss is a null rather than a constructed guess: the detail
 * page hides the button, instead of shipping a 404 to every listing.
 */
function mapListingUrl(r: Record<string, unknown>): string | null {
  return (
    asHttpUrl(r.url) ??
    asHttpUrl(get(r, "case", "url")) ??
    absoluteUrl(SITE_ORIGIN, asNonEmptyString(r.slug)) ??
    absoluteUrl(SITE_ORIGIN, asNonEmptyString(get(r, "address", "slug")))
  );
}

const SALE_TYPES: readonly SaleType[] = ["normal", "family", "auction", "other"];

/**
 * Maps `address.registrations[]` — the registered sales of the address, which
 * Boligsiden already embeds in every case record, so the property's price
 * history costs no extra request. Shape confirmed against a live response
 * (2026-08-01):
 *
 *   { amount, area, date, livingArea, perAreaPrice, registrationID, type }
 *
 * `perAreaPrice` is only present on newer registrations, so it falls back to
 * amount/area — and `livingArea` is preferred over `area` where both exist,
 * because `area` on older rows is the whole-property figure rather than the
 * dwelling's. Entries are returned newest-first. `type` is carried through
 * rather than filtered: a family transfer or a forced auction is *not* a
 * market price, and the reader needs to know that instead of seeing it
 * averaged in silently.
 */
export function mapRegistrations(raw: unknown): SoldPriceEntry[] {
  const registrations = Array.isArray(raw) ? raw : [];

  return registrations
    .map((entry): SoldPriceEntry | null => {
      const soldDate = asIsoDate(get(entry, "date"));
      const price = asPositiveNumber(get(entry, "amount"));
      if (soldDate === null || price === null) return null;

      const area = asPositiveNumber(get(entry, "livingArea")) ?? asPositiveNumber(get(entry, "area"));
      const pricePerSqm =
        asPositiveInt(get(entry, "perAreaPrice")) ?? (area !== null ? Math.round(price / area) : null);
      if (pricePerSqm === null) return null;

      const typeRaw = asNonEmptyString(get(entry, "type"))?.toLowerCase() ?? "";
      const saleType = SALE_TYPES.find((t) => t === typeRaw) ?? "other";

      return { soldDate, price, pricePerSqm, saleType };
    })
    .filter((entry): entry is SoldPriceEntry => entry !== null)
    .sort((a, b) => b.soldDate.localeCompare(a.soldDate));
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
    // Null (rather than a "today" guess) when none of these parse — a
    // fallback to today here would re-stamp every re-crawled listing with
    // the current date each run, since the same unparseable source field
    // fails the same way every time, permanently masquerading as freshest.
    // ingest.ts resolves the final value: an existing property keeps its
    // previously stored date, a new one gets first-seen-today.
    listing_date:
      asIsoDate(r.timeOnMarket) ?? asIsoDate(get(r, "status", "createdDate")) ?? asIsoDate(r.createdDate),
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
    listing_url: mapListingUrl(r),
    sold_price_history: mapRegistrations(get(r, "address", "registrations")),
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
    recordsOutOfArea: 0,
    errors: [],
  };

  const zipRanges = getZipRanges();

  if (MOCK_MODE) {
    const all = fixtures as unknown as RawListing[];
    const { kept, excluded } = filterByZipRanges(all, zipRanges);
    stats.recordsSeen = all.length;
    stats.recordsOutOfArea = excluded;
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
    // Best-effort server-side narrowing (undocumented param name, may be a
    // no-op, and — like Boliga's zipcodeFrom/zipcodeTo — only supports one
    // contiguous span even with multiple configured ranges) so pagination
    // isn't spent on nationwide results outside the configured area.
    // filterByZipRanges() below is the source of truth either way, so a
    // wrong guess costs nothing but wasted pages, never correctness.
    const bounds = overallZipBounds(zipRanges);
    params.set("zipCodeFrom", String(bounds.min));
    params.set("zipCodeTo", String(bounds.max));
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
    // TEMPORARY diagnostic (page 1 only): confirms whether zipCodeFrom/
    // zipCodeTo actually narrowed the response server-side, and surfaces the
    // real zip-related field name/shape on a live case record so a correct
    // param name can be picked instead of guessed again. Remove once the
    // real param name is confirmed and wired in.
    if (page === 1) {
      const first = cases[0] as Record<string, unknown> | undefined;
      const zipKeys = first
        ? Object.entries(first).filter(([k]) => /zip|postal|postnr/i.test(k))
        : [];
      const addressZipKeys = first && typeof first.address === "object" && first.address !== null
        ? Object.entries(first.address as Record<string, unknown>).filter(([k]) => /zip|postal|postnr/i.test(k))
        : [];
      logEvent("crawl.boligsiden.debug_page1", {
        totalHits: body.totalHits,
        total: body.total,
        casesLength: cases.length,
        topLevelZipKeys: zipKeys,
        addressZipKeys,
      });
    }
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
  stats.recordsOutOfArea = excluded;

  logEvent("crawl.boligsiden.fetched", { ...stats, listings: kept.length });
  return { listings: dedupeByExternalId(kept), stats };
}

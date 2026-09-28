import { createHash } from "node:crypto";
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
  enumerateZipCodes,
  filterByZipRanges,
  getZipRanges,
  isDanishCoordinate,
  isInZipRange,
} from "./map-utils.js";
import fixtures from "./fixtures/boligsiden.sample.json" with { type: "json" };
import { mockModeEnabled } from "../enrichment-sources/types.js";
import { isUuid } from "../http-helpers.js";

const MAX_ERRORS_REPORTED = 10;

/**
 * Boligsiden's unofficial search API — the same JSON endpoint boligsiden.dk's
 * own frontend calls. Unauthenticated and undocumented: the shape may drift
 * without notice, which is why every record goes through defensive mapping
 * (skip + count, never throw) and the endpoint is env-overridable.
 */
const API_BASE = process.env.BOLIGSIDEN_API_BASE ?? "https://api.boligsiden.dk/search/cases";

/**
 * Boligsiden addressType strings → our CHECK-constrained enum
 * (022_property_type_boligtype.sql). Unknown strings fall back to "other"
 * (see the call site below), so a wrong or missing guess degrades data
 * quality but never fails an upsert — same defensive posture as Boliga's
 * PROPERTY_TYPE_BY_CODE.
 */
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
  fritidsbolig: "summer_house",
  farm: "farm",
  landejendom: "farm",
  "villa apartment": "villa_apartment",
  villalejlighed: "villa_apartment",
  "cooperative housing": "cooperative",
  andelsbolig: "cooperative",
  "holiday plot": "holiday_plot",
  fritidsgrund: "holiday_plot",
  sommerhusgrund: "holiday_plot",
  "residential plot": "residential_plot",
  helårsgrund: "residential_plot",
  helaarsgrund: "residential_plot",
  villagrund: "residential_plot",
  houseboat: "houseboat",
  husbåd: "houseboat",
  husbaad: "houseboat",
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

/** Only a valid, unambiguous postcode can establish that a record is out
 * of scope. Missing/conflicting geography must remain a coverage warning. */
function mapPostalCode(raw: unknown): string | null {
  const supplied = [get(raw, "address", "zipCode"), get(raw, "address", "zip", "zipCode"), get(raw, "zipCode")]
    .filter((value) => value !== undefined && value !== null);
  const codes = supplied.map(asFiniteNumber);
  if (codes.length === 0 || codes.some((code) => code === null || !Number.isInteger(code) || code < 1000 || code > 9999)) return null;
  return new Set(codes).size === 1 ? String(codes[0]) : null;
}

function mapReportedTimeOnMarket(value: unknown): RawListing["reported_time_on_market"] {
  const days = (candidate: unknown): number | null =>
    typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 0 && candidate <= 36_500 ? candidate : null;
  const latestEpisodeDays = days(get(value, "current", "days"));
  const totalDays = days(get(value, "total", "days"));
  return latestEpisodeDays !== null || totalDays !== null ? { latestEpisodeDays, totalDays } : undefined;
}

/**
 * Boligsiden images carry a `category` (photo/floorplan/...) and an
 * `imageSources` array of pre-sized variants ({url, size: {width, height}}) — we
 * keep the whole set so the UI can pick the size it needs instead of only
 * ever seeing one fixed URL.
 */
function mapImage(img: unknown): ListingImage | null {
  const rawSourceItems = get(img, "imageSources");
  const sourceItems = Array.isArray(rawSourceItems) ? rawSourceItems : [];

  const sources = sourceItems
    .map((s) => {
      const url = asNonEmptyString(get(s, "url"));
      // The live feed nests dimensions under `size`; retain support for
      // older flat payloads. Dropping these left only the 100x80 thumbnail.
      const width = asPositiveInt(get(s, "size", "width")) ?? asPositiveInt(get(s, "width"));
      const height = asPositiveInt(get(s, "size", "height")) ?? asPositiveInt(get(s, "height"));
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
 * Prefer the address-page slug verified against the live feed and public site.
 * Only source-provided identity is used; no address text is converted to a slug.
 */
function mapListingUrl(r: Record<string, unknown>): string | null {
  const addressSlug = asNonEmptyString(r.slugAddress) ?? asNonEmptyString(get(r, "address", "slugAddress"));
  return (
    asHttpUrl(r.url) ??
    asHttpUrl(get(r, "case", "url")) ??
    (addressSlug && /^[a-z0-9æøå_-]+$/i.test(addressSlug) ? absoluteUrl(SITE_ORIGIN, `/adresse/${addressSlug}`) : null) ??
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

      const typeRaw = asNonEmptyString(get(entry, "type"))?.toLowerCase() ?? "";
      const saleType = SALE_TYPES.find((t) => t === typeRaw) ?? "other";

      const residentialArea = asPositiveNumber(get(entry, "livingArea"));
      const registrationId = asNonEmptyString(get(entry, "registrationID"));
      return {
        soldDate, price, pricePerSqm, saleType,
        ...(registrationId ? { registrationId } : {}),
        ...(residentialArea !== null ? { residentialArea, areaDefinition: "residential" as const } : { areaDefinition: "unknown" as const }),
      };
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
  const postalCode = mapPostalCode(r);
  const images = (Array.isArray(r.images) ? r.images : [])
    .map(mapImage)
    .filter((img): img is ListingImage => img !== null);
  const reportedTimeOnMarket = mapReportedTimeOnMarket(r.timeOnMarket);
  const changePercent = typeof r.priceChangePercentage === "number" && Number.isFinite(r.priceChangePercentage)
    && r.priceChangePercentage > -100 ? r.priceChangePercentage : null;
  const sourceAddressId = get(r, "address", "addressID");

  return {
    data_mode: "real",
    address,
    municipality,
    postal_code: postalCode,
    price,
    sqm,
    // Null (rather than a "today" guess) when none of these parse — a
    // fallback to today here would re-stamp every re-crawled listing with
    // the current date each run, since the same unparseable source field
    // fails the same way every time, permanently masquerading as freshest.
    // The crawler's first observation is stored separately.
    listing_date:
      asIsoDate(r.timeOnMarket) ?? asIsoDate(get(r, "status", "createdDate")) ?? asIsoDate(r.createdDate),
    ...(reportedTimeOnMarket ? { reported_time_on_market: reportedTimeOnMarket } : {}),
    ...(changePercent !== null ? { reported_price_change: { currentAsking: price, changePercent } } : {}),
    listing_source: "boligsiden",
    external_id: externalId,
    ...(isUuid(sourceAddressId) ? { source_address_id: sourceAddressId.toLowerCase() } : {}),
    lat,
    lon,
    status: "active",
    building_year: asPositiveInt(r.yearBuilt) ?? asPositiveInt(get(r, "address", "buildYear")) ?? asPositiveInt(r.buildYear),
    property_type: PROPERTY_TYPE_BY_ADDRESS_TYPE[addressType] ?? "other",
    rooms: asPositiveInt(r.numberOfRooms) ?? asPositiveInt(get(r, "address", "numberOfRooms")),
    images,
    description: asNonEmptyString(r.descriptionBody) ?? asNonEmptyString(r.descriptionTitle),
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
  const mockMode = mockModeEnabled("CRAWL_MOCK_MODE");
  const mappingWarnings: string[] = [];
  const stats: SourceCrawlStats = {
    source: "boligsiden",
    complete: false,
    dataMode: mockMode ? "mock" : "real",
    pagesFetched: 0,
    recordsSeen: 0,
    recordsSkipped: 0,
    recordsOutOfArea: 0,
    errors: [],
    mappingWarnings,
  };

  const zipRanges = getZipRanges();

  if (mockMode) {
    const all = (fixtures as unknown as RawListing[]).map((listing) => ({ ...listing, data_mode: "mock" as const }));
    const { kept, excluded } = filterByZipRanges(all, zipRanges);
    stats.recordsSeen = all.length;
    stats.recordsOutOfArea = excluded;
    stats.complete = true;
    return { listings: kept, stats };
  }

  const pageSize = envInt("CRAWL_PAGE_SIZE", 100, 1, 500);
  const maxPages = envInt("CRAWL_MAX_PAGES", 10, 1, 1000);
  const maxListings = envInt("CRAWL_MAX_LISTINGS", 1000, 1, 50_000);
  const delayMs = envInt("CRAWL_DELAY_MS", 250, 0, 10_000);

  const listings: RawListing[] = [];
  const seenIds = new Set<string>();
  let duplicateRecords = 0;
  // Never send a truncated scope: upstream would correctly exclude the
  // omitted postcodes and a complete response would conceal that gap.
  // Broad scopes use a nationwide feed plus the authoritative local filter.
  const zipCodes = enumerateZipCodes(zipRanges, 301);

  for (let page = 1; page <= maxPages && stats.recordsSeen < maxListings; page++) {
    if (page > 1) await sleep(delayMs);

    const params = new URLSearchParams({
      per_page: String(pageSize),
      page: String(page),
      sortBy: "timeOnMarket",
      sortAscending: "true", // newest listings first
    });
    // Best-effort server-side narrowing. Local filtering remains required
    // because the frontend API is undocumented and can change independently.
    if (zipCodes.length <= 300) {
      for (const zip of zipCodes) params.append("zipCodes", String(zip));
    }
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
    if (!Array.isArray(body.cases)) {
      stats.errors.push(`page ${page}: missing cases array`);
      break;
    }
    const cases = body.cases;
    let processed = 0;
    let newIdentities = 0;
    const duplicatesBeforePage = duplicateRecords;
    if (page === 1) {
      logEvent("crawl.boligsiden.scope", {
        totalHits: body.totalHits,
        total: body.total,
        casesLength: cases.length,
        zipCodesSent: params.getAll("zipCodes").length,
      });
    }
    for (const record of cases) {
      if (stats.recordsSeen >= maxListings) break;
      processed += 1;
      stats.recordsSeen += 1;
      // Track pagination before scope/mapping exclusions. A repeated page of
      // out-of-area plots must not inflate recordsSeen into apparent coverage.
      const externalId = asNonEmptyString(get(record, "caseID")) ?? asNonEmptyString(get(record, "caseId"));
      const identity = externalId !== null ? `id:${externalId}`
        : `raw:${createHash("sha256").update(JSON.stringify(record) ?? "undefined").digest("hex")}`;
      const duplicate = seenIds.has(identity);
      if (duplicate) {
        duplicateRecords += 1;
      } else {
        seenIds.add(identity);
        newIdentities += 1;
      }

      const postalCode = mapPostalCode(record);
      if (postalCode !== null && !isInZipRange(postalCode, zipRanges)) {
        stats.recordsOutOfArea += 1;
        continue;
      }
      if (postalCode === null) {
        stats.recordsSkipped += 1;
        if (mappingWarnings.length < MAX_ERRORS_REPORTED) {
          mappingWarnings.push(`page ${page}: skipped record with unknown or conflicting postcode`);
        }
        continue;
      }
      const listing = mapBoligsidenCase(record);
      if (listing === null) {
        stats.recordsSkipped += 1;
        if (mappingWarnings.length < MAX_ERRORS_REPORTED) {
          mappingWarnings.push(`page ${page}: skipped unmappable record`);
        }
        continue;
      }
      if (!duplicate) listings.push(listing);
    }

    const total = asPositiveInt(body.totalHits) ?? asPositiveInt(body.total);
    if (newIdentities === 0 && duplicateRecords > duplicatesBeforePage) {
      stats.errors.push(`page ${page}: no new listing identities; pagination did not advance`);
      break;
    }
    // Count returned records, not requested page size: providers may cap
    // per_page. Without a total, only an empty page proves exhaustion.
    if ((total !== null && stats.recordsSeen >= total) || cases.length === 0) {
      const exhausted = total === null || stats.recordsSeen >= total;
      stats.complete = exhausted && processed === cases.length && stats.recordsSkipped === 0 && duplicateRecords === 0;
      if (!exhausted) stats.errors.push(`page ${page}: empty page before the reported feed total`);
      break;
    }
  }

  if (duplicateRecords > 0 && mappingWarnings.length < MAX_ERRORS_REPORTED) {
    mappingWarnings.push(`${duplicateRecords} duplicate listing identities; feed changed or pagination overlapped`);
  }

  const { kept, excluded } = filterByZipRanges(listings, zipRanges);
  stats.recordsOutOfArea += excluded;

  logEvent("crawl.boligsiden.fetched", { ...stats, listings: kept.length });
  return { listings: dedupeByExternalId(kept), stats };
}

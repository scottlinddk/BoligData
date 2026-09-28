import type { ListingDetails } from "../../../../packages/shared/src/types/index.js";
import { mapBoligsidenListingFacts } from "./crawl/boligsiden-listing-facts.js";
import { fetchJson } from "./crawl/http.js";
import { asNonEmptyString, isDanishCoordinate } from "./crawl/map-utils.js";
import { boxPolygon } from "./enrichment-sources/boligsiden-sales.js";
import { isUuid } from "./http-helpers.js";

const API_ORIGIN = "https://api.boligsiden.dk";
const SITE_ORIGIN = "https://www.boligsiden.dk";
const TIMEOUT_MS = 3_000;
const CACHE_MS = 5 * 60_000;
const FAILURE_CACHE_MS = 30_000;
const MAX_CACHE_ENTRIES = 500;
const MAX_SEARCH_PAGES = 5;

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

export interface BoligsidenDetailsOptions {
  sourceAddressId?: string | null;
  lat?: number | null;
  lon?: number | null;
  postalCode?: string | null;
}

function caseIdentity(value: unknown): string | null {
  const id = record(value)?.caseID;
  return isUuid(id) ? id.toLowerCase() : null;
}

/** `descriptionBody` is the broker's text displayed under "Mægler skriver".
 * The source can provide an excerpt (including for Skytten 1A); retain what
 * it actually publishes, without inventing a continuation or rendering HTML. */
export function mapBoligsidenDetails(raw: unknown, externalId: string): ListingDetails | null {
  const listing = record(raw);
  if (!listing || !isUuid(externalId) || caseIdentity(listing) !== externalId.toLowerCase()) return null;
  const address = record(listing.address);
  const slug = asNonEmptyString(listing.slugAddress) ?? asNonEmptyString(address?.slugAddress);
  const sourceUrl = slug && /^[a-z0-9æøå_-]+$/i.test(slug)
    ? `${SITE_ORIGIN}/adresse/${slug}`
    : `${SITE_ORIGIN}/viderestilling/${externalId.toLowerCase()}`;
  return {
    source: "boligsiden",
    sourceUrl,
    title: asNonEmptyString(listing.descriptionTitle),
    description: asNonEmptyString(listing.descriptionBody),
    facts: mapBoligsidenListingFacts(listing),
    fetchedAt: new Date().toISOString(),
  };
}

async function request(url: string, deadline: number): Promise<unknown> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("Listing details source deadline exceeded");
  return fetchJson(url, { attempts: 1, timeoutMs: remaining });
}

async function lookup(externalId: string, options: BoligsidenDetailsOptions): Promise<ListingDetails | null> {
  const deadline = Date.now() + TIMEOUT_MS;
  try {
    if (isUuid(options.sourceAddressId)) {
      const addressId = options.sourceAddressId.toLowerCase();
      const address = record(await request(`${API_ORIGIN}/addresses/${addressId}`, deadline));
      if (!address || !isUuid(address.addressID) || address.addressID.toLowerCase() !== addressId) return null;
      const matches = Array.isArray(address.cases) ? address.cases.filter(item => caseIdentity(item) === externalId) : [];
      if (matches.length !== 1) return null;
      const listing = record(matches[0])!;
      const nestedAddress = record(listing.address);
      if (nestedAddress?.addressID !== undefined && nestedAddress.addressID !== address.addressID) return null;
      return mapBoligsidenDetails({ ...listing, address: { ...address, ...nestedAddress } }, externalId);
    }

    // /cases/{id} is not publicly available. The geographic case-search
    // endpoint is: a 50m box at Skytten 1A returns its two advertised units.
    // Coordinates only narrow discovery; an exact case UUID selects the unit.
    const { lat, lon } = options;
    const query = new URLSearchParams({ per_page: "100", page: "1" });
    if (typeof lat === "number" && typeof lon === "number" && isDanishCoordinate(lat, lon)) {
      query.set("polygon", boxPolygon(lat, lon, 50));
    } else if (options.postalCode && /^\d{4}$/.test(options.postalCode)) {
      query.set("zipCodes", options.postalCode);
    } else {
      return null;
    }

    const seen = new Set<string>();
    for (let page = 1; page <= MAX_SEARCH_PAGES; page++) {
      query.set("page", String(page));
      const body = record(await request(`${API_ORIGIN}/search/cases?${query}`, deadline));
      if (!Array.isArray(body?.cases)) return null;
      const matches = body.cases.filter(item => caseIdentity(item) === externalId);
      if (matches.length > 1) return null;
      if (matches.length === 1) return mapBoligsidenDetails(matches[0], externalId);
      const before = seen.size;
      for (const item of body.cases) {
        const id = caseIdentity(item);
        if (id) seen.add(id);
      }
      if (body.cases.length === 0 || seen.size === before) return null;
      if (typeof body.totalHits === "number" && seen.size >= body.totalHits) return null;
    }
    return null;
  } catch {
    // Optional source content must never stop the stored property from loading.
    return null;
  }
}

const cache = new Map<string, { expiresAt: number; value: Promise<ListingDetails | null> }>();

/** Enrich existing rows on detail reads, without waiting for another crawl.
 * Bound upstream time, coalesce concurrent reads, and briefly cache failures. */
export function fetchBoligsidenDetails(externalId: string, options: BoligsidenDetailsOptions = {}): Promise<ListingDetails | null> {
  if (!isUuid(externalId)) return Promise.resolve(null);
  const id = externalId.toLowerCase();
  const key = JSON.stringify([id, options.sourceAddressId ?? null, options.lat ?? null, options.lon ?? null, options.postalCode ?? null]);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const entry = { expiresAt: Date.now() + CACHE_MS, value: Promise.resolve<ListingDetails | null>(null) };
  entry.value = lookup(id, options).then(value => {
    entry.expiresAt = Date.now() + (value ? CACHE_MS : FAILURE_CACHE_MS);
    return value;
  });
  cache.set(key, entry);
  if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  return entry.value;
}

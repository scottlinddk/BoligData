import { createHash } from "node:crypto";
import type { RawListing } from "./types.js";
import { envInt } from "./http.js";

/**
 * Guards shared by the Boliga/Boligsiden record mappers. The upstream JSON
 * APIs are unofficial and undocumented, so every field is treated as
 * untrusted: mappers return null for records missing required data instead
 * of throwing, and the crawl counts skips rather than failing the batch.
 */

export function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function asPositiveNumber(value: unknown): number | null {
  const n = asFiniteNumber(value);
  return n !== null && n > 0 ? n : null;
}

export function asPositiveInt(value: unknown): number | null {
  const n = asPositiveNumber(value);
  return n !== null ? Math.trunc(n) : null;
}

export function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** Accepts "YYYY-MM-DD..." (ISO datetime included); returns the date part. */
export function asIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/** Denmark (incl. Bornholm) plausibility bounds. */
export function isDanishCoordinate(lat: number, lon: number): boolean {
  return lat >= 54 && lat <= 58 && lon >= 7 && lon <= 16;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v !== "");
}

/**
 * Stable fingerprint of the listing content, stored on properties.content_hash
 * so the ingest can skip re-enriching unchanged listings. Field order is fixed
 * — changing it invalidates every stored hash and triggers one full re-enrich.
 */
export function listingContentHash(l: RawListing): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        l.address,
        l.municipality,
        l.postal_code,
        l.price,
        l.sqm,
        l.listing_date,
        l.status,
        l.building_year,
        l.property_type,
        l.rooms,
        l.description,
        l.agent_name,
      ]),
    )
    .digest("hex");
}

/** Dedupe by external_id — duplicate keys in one upsert chunk are a Postgres error (21000). */
export function dedupeByExternalId(listings: RawListing[]): RawListing[] {
  const seen = new Map<string, RawListing>();
  for (const listing of listings) seen.set(listing.external_id, listing);
  return [...seen.values()];
}

export interface ZipRange {
  min: number;
  max: number;
}

/**
 * Which Danish postal codes to scrape, read fresh on every call so it can be
 * changed via env var without a code change. Defaults to 9000-9900 (North
 * Jutland) per the initial rollout; widen/narrow later by setting
 * CRAWL_ZIP_MIN / CRAWL_ZIP_MAX.
 */
export function getZipRange(): ZipRange {
  const min = envInt("CRAWL_ZIP_MIN", 9000, 1000, 9999);
  const max = envInt("CRAWL_ZIP_MAX", 9900, 1000, 9999);
  return min <= max ? { min, max } : { min: max, max: min };
}

export function isInZipRange(postalCode: string | null, range: ZipRange): boolean {
  if (postalCode === null) return false;
  const zip = Number(postalCode);
  return Number.isInteger(zip) && zip >= range.min && zip <= range.max;
}

/** Applies the configured zip range to a batch of already-mapped listings. */
export function filterByZipRange(
  listings: RawListing[],
  range: ZipRange = getZipRange(),
): { kept: RawListing[]; excluded: number } {
  const kept = listings.filter((l) => isInZipRange(l.postal_code, range));
  return { kept, excluded: listings.length - kept.length };
}

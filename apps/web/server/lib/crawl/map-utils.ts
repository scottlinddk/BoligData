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

function clampZip(value: number): number {
  return Math.min(9999, Math.max(1000, value));
}

/**
 * Parses "9000-9900, 6000-6600" into ranges, clamping each bound to the
 * valid Danish postal-code span and swapping reversed pairs. Malformed
 * tokens (not "<digits>-<digits>") are skipped rather than failing the
 * whole crawl on a typo'd env var.
 */
export function parseZipRanges(input: string): ZipRange[] {
  const ranges: ZipRange[] = [];
  for (const token of input.split(",")) {
    const match = token.trim().match(/^(\d{1,4})\s*-\s*(\d{1,4})$/);
    if (!match) continue;
    const a = clampZip(Number(match[1]));
    const b = clampZip(Number(match[2]));
    ranges.push(a <= b ? { min: a, max: b } : { min: b, max: a });
  }
  return ranges;
}

/**
 * Which Danish postal codes to scrape, read fresh on every call so it can be
 * changed via env var without a code change. CRAWL_ZIP_RANGES holds a
 * comma-separated list of "min-max" intervals, e.g. "9000-9900,6000-6600",
 * so crawling isn't limited to one contiguous span. Falls back to the
 * legacy single-range CRAWL_ZIP_MIN / CRAWL_ZIP_MAX (default 9000-9900,
 * North Jutland) when CRAWL_ZIP_RANGES isn't set.
 */
export function getZipRanges(): ZipRange[] {
  const rangesEnv = process.env.CRAWL_ZIP_RANGES?.trim();
  if (rangesEnv) {
    const parsed = parseZipRanges(rangesEnv);
    if (parsed.length > 0) return parsed;
  }
  const min = envInt("CRAWL_ZIP_MIN", 9000, 1000, 9999);
  const max = envInt("CRAWL_ZIP_MAX", 9900, 1000, 9999);
  return [min <= max ? { min, max } : { min: max, max: min }];
}

export function isInZipRange(postalCode: string | null, ranges: ZipRange[]): boolean {
  if (postalCode === null) return false;
  const zip = Number(postalCode);
  if (!Number.isInteger(zip)) return false;
  return ranges.some((range) => zip >= range.min && zip <= range.max);
}

/** Applies the configured zip ranges to a batch of already-mapped listings. */
export function filterByZipRanges(
  listings: RawListing[],
  ranges: ZipRange[] = getZipRanges(),
): { kept: RawListing[]; excluded: number } {
  const kept = listings.filter((l) => isInZipRange(l.postal_code, ranges));
  return { kept, excluded: listings.length - kept.length };
}

/** Overall min/max spanning all configured ranges — for best-effort upstream API params only. */
export function overallZipBounds(ranges: ZipRange[]): ZipRange {
  return {
    min: Math.min(...ranges.map((r) => r.min)),
    max: Math.max(...ranges.map((r) => r.max)),
  };
}

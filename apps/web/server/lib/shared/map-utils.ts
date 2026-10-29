
/**
 * Guards shared by the register mappers. Upstream JSON is treated as
 * untrusted: each helper returns null for a missing or malformed value
 * instead of throwing.
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

/**
 * Absolute http(s) URL, or null. Stricter than asNonEmptyString on purpose:
 * the result is stored in `properties.listing_url` and rendered as an `href`,
 * so a `javascript:`/`data:` string from an undocumented upstream API would
 * be stored XSS. Relative paths are rejected too — callers that know the
 * source's origin should join it themselves (see `absoluteUrl`).
 */
export function asHttpUrl(value: unknown): string | null {
  const raw = asNonEmptyString(value);
  if (raw === null) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
}

/**
 * Joins a source-relative path (a slug, say) onto that source's origin and
 * validates the result. Returns null for an empty path or one that resolves
 * off-origin, so an upstream `//evil.example` can't redirect the link out.
 */
export function absoluteUrl(origin: string, path: unknown): string | null {
  const raw = asNonEmptyString(path);
  if (raw === null) return null;
  let resolved: URL;
  try {
    resolved = new URL(raw, origin);
  } catch {
    return null;
  }
  if (resolved.origin !== new URL(origin).origin) return null;
  return asHttpUrl(resolved.toString());
}

/** Accepts "YYYY-MM-DD..." (ISO datetime included); returns the date part. */
export function asIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

/** Denmark (incl. Bornholm) plausibility bounds. */
export function isDanishCoordinate(lat: number, lon: number): boolean {
  return lat >= 54 && lat <= 58 && lon >= 7 && lon <= 16;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v !== "");
}

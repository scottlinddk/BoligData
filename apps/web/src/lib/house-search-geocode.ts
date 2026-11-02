import { etrs89Utm32ToWgs84 } from "@shared/utils/etrs89-utm32";
import { buildHusnummerUrl, isHusnummerId } from "@/lib/address-search";

/** Where an address is, as far as the register can tell. Either field may be null: the entry is still saved. */
export interface ResolvedAddress {
  lat: number | null;
  lon: number | null;
  postalCode: string | null;
}

// Mainland Denmark, Bornholm and the islands. Rejects projection mistakes (swapped axes, wrong zone).
const LAT_RANGE = [54.4, 57.9] as const;
const LON_RANGE = [7.5, 15.4] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isDanishPoint(lat: number, lon: number): boolean {
  return lat >= LAT_RANGE[0] && lat <= LAT_RANGE[1] && lon >= LON_RANGE[0] && lon <= LON_RANGE[1];
}

/** Adressevælger `/husnumre/{id}` body -> WGS84 point and postcode. Returns null only when the body is not a husnummer. */
export function parseHusnummerLocation(raw: unknown): ResolvedAddress | null {
  const husnummer = asRecord(asRecord(raw)?.husnummer);
  if (husnummer === null) return null;

  const point = asRecord(asRecord(husnummer.adgangspunkt)?.koordinater);
  const easting = finite(point?.x);
  const northing = finite(point?.y);
  const wgs84 = easting !== null && northing !== null ? etrs89Utm32ToWgs84(easting, northing) : null;
  const located = wgs84 !== null && isDanishPoint(wgs84.lat, wgs84.lon);

  const postnr = asRecord(husnummer.postnummer)?.postnr;
  const postalCode = typeof postnr === "string" && /^\d{4}$/.test(postnr) ? postnr : null;

  return { lat: located ? wgs84.lat : null, lon: located ? wgs84.lon : null, postalCode };
}

/**
 * Looks the picked address up so the entry can be drawn on the map. Never throws:
 * a failed lookup yields an unlocated address, because losing the entry over a
 * missing coordinate would be worse than leaving it off the map.
 */
export async function resolveHusnummer(id: string, signal?: AbortSignal): Promise<ResolvedAddress> {
  const unlocated: ResolvedAddress = { lat: null, lon: null, postalCode: null };
  if (!isHusnummerId(id)) return unlocated;
  try {
    const res = await fetch(buildHusnummerUrl(id), { signal });
    if (!res.ok) return unlocated;
    return parseHusnummerLocation(await res.json()) ?? unlocated;
  } catch {
    return unlocated;
  }
}

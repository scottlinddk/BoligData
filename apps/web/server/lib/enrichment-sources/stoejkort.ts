import { fetchJson } from "../crawl/http.js";
import { hashSeed, sourceFailed, sourceOk, type SourceResult } from "./types.js";

const MOCK_MODE = process.env.STOEJKORT_MOCK_MODE !== "false";

/**
 * Miljøstyrelsen's "Støj-Danmarkskortet" (Lden road/rail noise mapping) WFS,
 * part of the "Noise Map" theme group on geoserver.plandata.dk. Miljøstyrelsen
 * states access to that theme group requires contacting them directly — this
 * is not a fully open self-serve endpoint like DAWA or GEUS Jordartskort, so
 * the exact layer name and auth requirements are unverified. Confirm both
 * against a live GetCapabilities response before flipping
 * STOEJKORT_MOCK_MODE=false, same caveat as miljoeportalen-v1v2.ts and bbr.ts.
 */
const API_BASE = process.env.STOEJKORT_API_BASE ?? "https://geoserver.plandata.dk/geoserver/wfs";

interface StoejkortFeature {
  properties?: { lden?: unknown };
}
interface StoejkortResponse {
  features?: StoejkortFeature[];
}

/**
 * Deterministic mock Lden value (dB) in a realistic range for a residential
 * point — replaces enrich.ts's old inline `40 + (seed % 25)` derivation.
 */
export function mockNoiseExposure(lat: number, lon: number): number {
  const seed = hashSeed(`${lat.toFixed(4)},${lon.toFixed(4)}`);
  return 40 + (seed % 25);
}

/**
 * Looks up the road/rail traffic noise level (Lden, dB) at a point from
 * Miljøstyrelsen's noise mapping. `ldenDb: null` means the point falls
 * outside any mapped noise-exposed area (a positive "not exposed" result,
 * distinct from a failed lookup which returns `ok: false`).
 */
export async function lookupNoiseExposure(lat: number, lon: number): Promise<SourceResult<{ ldenDb: number | null }>> {
  if (MOCK_MODE) return sourceOk({ ldenDb: mockNoiseExposure(lat, lon) });

  try {
    const params = new URLSearchParams({
      service: "WFS",
      request: "GetFeature",
      typeName: "noise_map:lden_road_rail",
      outputFormat: "application/json",
      bbox: `${lon - 0.0005},${lat - 0.0005},${lon + 0.0005},${lat + 0.0005},EPSG:4326`,
    });
    const body = await fetchJson<StoejkortResponse>(`${API_BASE}?${params}`);
    const feature = body.features?.[0];
    const raw = feature?.properties?.lden;
    const ldenDb = typeof raw === "number" ? raw : raw !== undefined ? Number(raw) : null;
    return sourceOk({ ldenDb: Number.isFinite(ldenDb) ? ldenDb : null });
  } catch (err) {
    return sourceFailed(err);
  }
}

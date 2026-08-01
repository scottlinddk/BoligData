import { fetchJson } from "../crawl/http.js";
import { hashSeed, mockModeEnabled, sourceFailed, sourceOk, type SourceResult } from "./types.js";

const MOCK_FLAG = "STOEJKORT_MOCK_MODE";

/**
 * Miljøstyrelsen's "Støj-Danmarkskortet" (Lden road/rail noise mapping) WFS,
 * part of the "Støjkort" theme group on geoserver.plandata.dk. Miljøstyrelsen
 * states access to that theme group requires contacting them directly — this
 * is not a fully open self-serve endpoint like DAWA or GEUS Jordartskort.
 *
 * Consequently **the layer name is configuration, not a default**. The guessed
 * `noise_map:lden_road_rail` was answered with `HTTP 400` (GeoServer's reply
 * to an unknown `typeName`) on every listing view, which read in the UI as an
 * upstream outage rather than as "this repo never had access". Until
 * `STOEJKORT_TYPENAME` is set from a live `GetCapabilities` response, the
 * lookup is skipped and reported as unconfigured — no request, no misleading
 * error. `STOEJKORT_MOCK_MODE=true` brings back a synthetic dB value that
 * reads like a measurement, so it belongs in local development only.
 */
const API_BASE = process.env.STOEJKORT_API_BASE ?? "https://geoserver.plandata.dk/geoserver/wfs";

/**
 * WFS 2.0.0: `typeNames`/`count` (not 1.1.0's `typeName`/`maxFeatures`), and
 * the CRS is named by URN. Sending no `version` at all — which is what this
 * did — leaves the axis order of `EPSG:4326` up to the server's default
 * version, and lat/lon vs lon/lat silently decides whether the bbox lands in
 * Denmark or in Somalia.
 */
const WFS_VERSION = "2.0.0";
const CRS_URN = "urn:ogc:def:crs:EPSG::4326";

/** Half-side of the query box around the point, in degrees (~55 m at Danish latitudes). */
const BBOX_HALF_SIDE_DEG = 0.0005;

interface StoejkortFeature {
  properties?: Record<string, unknown>;
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
 * Builds the GetFeature request for a small box around the point. The bbox is
 * ordered lat,lon to match the axis order the EPSG:4326 URN mandates under
 * WFS 2.0.0.
 */
export function buildGetFeatureUrl(typeName: string, lat: number, lon: number): string {
  const params = new URLSearchParams({
    service: "WFS",
    version: WFS_VERSION,
    request: "GetFeature",
    typeNames: typeName,
    outputFormat: "application/json",
    count: "1",
    srsName: CRS_URN,
    bbox: [
      lat - BBOX_HALF_SIDE_DEG,
      lon - BBOX_HALF_SIDE_DEG,
      lat + BBOX_HALF_SIDE_DEG,
      lon + BBOX_HALF_SIDE_DEG,
      CRS_URN,
    ].join(","),
  });
  return `${API_BASE}?${params}`;
}

/**
 * Reads the Lden value off a feature. The attribute is named per publisher
 * (`lden`, `LDEN`, `lden_db`, ...), so an explicitly configured
 * `STOEJKORT_LDEN_PROPERTY` wins and otherwise any numeric property whose name
 * starts with "lden" is accepted — a layer that carries the value under a
 * fourth spelling is a config change, not a code change.
 */
export function readLden(properties: Record<string, unknown> | undefined): number | null {
  if (properties === undefined) return null;

  const configured = process.env.STOEJKORT_LDEN_PROPERTY?.trim();
  const entries = Object.entries(properties);
  const match =
    (configured ? entries.find(([name]) => name === configured) : undefined) ??
    entries.find(([name]) => name.toLowerCase().replace(/[^a-z]/g, "").startsWith("lden"));

  if (match === undefined) return null;
  const value = typeof match[1] === "number" ? match[1] : Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Looks up the road/rail traffic noise level (Lden, dB) at a point from
 * Miljøstyrelsen's noise mapping. `ldenDb: null` means the point falls
 * outside any mapped noise-exposed area (a positive "not exposed" result,
 * distinct from a failed lookup which returns `ok: false`).
 */
export async function lookupNoiseExposure(lat: number, lon: number): Promise<SourceResult<{ ldenDb: number | null }>> {
  if (mockModeEnabled(MOCK_FLAG)) return sourceOk({ ldenDb: mockNoiseExposure(lat, lon) });

  const typeName = process.env.STOEJKORT_TYPENAME?.trim();
  if (!typeName) {
    return sourceFailed(
      "STOEJKORT_TYPENAME not configured — the Støjkort theme group is not self-serve; " +
        "get the layer name from Miljøstyrelsen and confirm it against GetCapabilities",
    );
  }

  try {
    const body = await fetchJson<StoejkortResponse>(buildGetFeatureUrl(typeName, lat, lon));
    return sourceOk({ ldenDb: readLden(body.features?.[0]?.properties) });
  } catch (err) {
    return sourceFailed(err);
  }
}

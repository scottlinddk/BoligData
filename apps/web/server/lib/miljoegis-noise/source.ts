import type { MiljoegisNoiseReport, NoiseLayerResult, MappedNoiseBand } from "../../../../../packages/shared/src/types/miljoegis-noise.js";
import { toUtm32, pointInNoiseGeometry, type Point } from "./geometry.js";
import { MILJOEGIS_ORIGIN, NOISE_LAYERS } from "./layers.js";

type Layer = (typeof NOISE_LAYERS)[number];
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_FEATURES = 20;
const TIMEOUT_MS = 40_000;
const CACHE_MS = 15 * 60_000;
const cache = new Map<string, { expires: number; result: MiljoegisNoiseReport }>();
const pending = new Map<string, Promise<MiljoegisNoiseReport>>();
class ResponseLimitError extends Error {}
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function buildNoiseQuery(layer: Layer, point: Point): URL {
  const url = new URL("/spatialmap", MILJOEGIS_ORIGIN);
  url.search = new URLSearchParams({
    profile: "noise", page: "spatialserver.datasource.execute-wkt-filter", datasource: layer.layer,
    command: "read", wkt: `POINT(${point[0].toFixed(3)} ${point[1].toFixed(3)})`,
    filterWithWkt: "true", maxrow: String(MAX_FEATURES), outputformat: "json", jsonformat: "compact",
  }).toString();
  return url;
}

export function noiseMapUrl(layer: Layer, point?: Point): string {
  const url = new URL("/spatialmap", MILJOEGIS_ORIGIN);
  url.searchParams.set("profile", "noise");
  url.searchParams.set("mapext", point ? `${point[0] - 600} ${point[1] - 400} ${point[0] + 600} ${point[1] + 400}` : "80600 5998000 1124900 6490000");
  url.searchParams.set("layers", `theme-dtk_skaermkort_daempet_daf ${layer.theme}`);
  return url.href;
}

function bandFrom(value: Record<string, unknown>, layer: Layer): MappedNoiseBand | null {
  const lower = value.isov1, upper = value.isov2;
  if (typeof lower !== "number" || typeof upper !== "number" || !Number.isFinite(lower) || !Number.isFinite(upper) || lower < 0 || upper > 150) return null;
  // Finite intervals must match this layer's published legend. Native numeric
  // encoding of the open top category is unverified, so do not invent one.
  return [0, 5, 10, 15].some(offset => lower === layer.lowestBand + offset && upper === lower + 5)
    ? { lowerDb: lower, upperDb: upper } : null;
}

export function parseNoiseLayer(raw: unknown, layer: Layer, point: Point): NoiseLayerResult {
  const result: NoiseLayerResult = { source: layer.source, metric: layer.metric, layer: layer.layer, status: "unavailable", bands: [], reason: "invalid_response" };
  if (!Array.isArray(raw)) return result;
  // A response at the cap may be truncated: never pick its first band.
  if (raw.length >= MAX_FEATURES) return { ...result, reason: "response_limit" };
  const bands = new Map<string, MappedNoiseBand>();
  let onBoundary = false;
  for (const value of raw) {
    const row = record(value);
    if (!row) return result;
    if (typeof row.shape_wkt === "string" && row.shape_wkt.length > 500_000) return { ...result, reason: "response_limit" };
    const relation = pointInNoiseGeometry(point, row.shape_wkt);
    if (relation === "invalid") return result;
    if (relation === "outside") continue;
    const band = bandFrom(row, layer);
    if (!band) return result;
    bands.set(`${band.lowerDb}/${band.upperDb}`, band);
    if (relation === "boundary") onBoundary = true;
  }
  const matches = [...bands.values()].sort((a, b) => a.lowerDb - b.lowerDb);
  return { ...result, reason: null, bands: matches,
    status: onBoundary ? "boundary" : matches.length > 1 ? "overlapping_bands" : matches.length === 1 ? "band_found" : "no_contour" };
}

async function boundedJson(url: URL, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url.href, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Noise source unavailable");
  if (Number(response.headers.get("content-length")) > MAX_BYTES) {
    await response.body?.cancel();
    throw new ResponseLimitError();
  }
  if (!response.body) throw new Error("Missing source response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); throw new ResponseLimitError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export interface NoiseListingInput { lat: number | null; lon: number | null; dataMode?: string }

/** One chosen source/metric per request. No nationwide polygon download, fuzzy
 * address lookup, numeric midpoint, source summation or below-threshold inference.
 */
export async function lookupMiljoegisNoise(input: NoiseListingInput, layer: Layer): Promise<MiljoegisNoiseReport> {
  const base: MiljoegisNoiseReport = { status: "unavailable", reason: null, checkedAt: new Date().toISOString(),
    mappingYear: 2022, calculationMethod: "Nord2000", heightMeters: 1.5, coordinates: null, mapUrl: noiseMapUrl(layer), layers: [] };
  if (input.dataMode === "mock" || input.dataMode === "demo") return { ...base, reason: "nonlive_data" };
  if (input.lat === null || input.lon === null || !Number.isFinite(input.lat) || !Number.isFinite(input.lon) ||
    input.lat < 54 || input.lat > 58 || input.lon < 7 || input.lon > 16) return { ...base, reason: "coordinates_missing" };
  const point = toUtm32(input.lat, input.lon);
  const key = `${layer.layer}/${input.lat}/${input.lon}`;
  const prior = cache.get(key);
  if (prior && prior.expires > Date.now()) return prior.result;
  const active = pending.get(key);
  if (active) return active;
  const load = async (): Promise<MiljoegisNoiseReport> => {
    let result: NoiseLayerResult;
    try {
      const data = await boundedJson(buildNoiseQuery(layer, point), AbortSignal.timeout(TIMEOUT_MS));
      result = parseNoiseLayer(data, layer, point);
    } catch (error) {
      result = { source: layer.source, metric: layer.metric, layer: layer.layer, status: "unavailable", bands: [],
        reason: error instanceof ResponseLimitError ? "response_limit" : "upstream_unavailable" };
    }
    const report: MiljoegisNoiseReport = { ...base, status: result.status === "unavailable" ? "unavailable" : "available",
      reason: result.status === "unavailable" ? "upstream_unavailable" : null,
      coordinates: { latitude: input.lat!, longitude: input.lon! }, mapUrl: noiseMapUrl(layer, point), layers: [result] };
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(key, { result: report, expires: Date.now() + (report.status === "available" ? CACHE_MS : 15_000) });
    return report;
  };
  const promise = load();
  pending.set(key, promise);
  try { return await promise; } finally { pending.delete(key); }
}

import type { ParcelMapParcel, ParcelMapResponse } from "../../../../../packages/shared/src/types/parcel-map.js";
import { fetchJson } from "../crawl/http.js";
import { etrs89Utm32ToWgs84, wgs84ToEtrs89Utm32 } from "../geo/etrs89-utm32.js";
import { parseCadastralGeometry } from "../cadastral/geometry.js";
import { MAX_PARCELS, type Bbox } from "./bbox.js";

const GRAPHQL = "https://graphql.datafordeler.dk/MAT/v2";
const TIMEOUT = 6_000;
const MOCK_FLAG = "PARCEL_MAP_MOCK_MODE";
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;
const id = (v: unknown): string | null => /^[1-9]\d{0,14}$/.test(String(v)) ? String(v) : null;

/** Mock mode is the default (like the crawl/enrichment flags) so the map stays demoable without registers. */
export const parcelMapMockMode = (): boolean => (process.env[MOCK_FLAG] ?? "true").toLowerCase() !== "false";

/** Two fictitious parcels around the viewport centre. They never carry a real BFE, so no owner lookup can follow. */
export function mockParcels(bbox: Bbox): ParcelMapResponse {
  const w = bbox.maxLon - bbox.minLon, h = bbox.maxLat - bbox.minLat;
  const box = (x0: number, x1: number): [number, number][][] => {
    const [a, b] = [bbox.minLon + w * x0, bbox.minLon + w * x1], [c, d] = [bbox.minLat + h * 0.4, bbox.minLat + h * 0.6];
    return [[[a, c], [b, c], [b, d], [a, d], [a, c]]];
  };
  return { status: "available", source: "mock", truncated: false, parcels: [
    { id: "mock-1", bfeNumber: null, number: "1a", district: "Demo", geometry: { type: "Polygon", coordinates: box(0.2, 0.48) } },
    { id: "mock-2", bfeNumber: null, number: "1b", district: "Demo", geometry: { type: "Polygon", coordinates: box(0.52, 0.8) } },
  ] };
}

function toWgs84(polygons: [number, number][][][]): ParcelMapParcel["geometry"] | null {
  const out: [number, number][][][] = [];
  for (const polygon of polygons) {
    const rings: [number, number][][] = [];
    for (const ring of polygon) {
      const converted = ring.map(([x, y]) => etrs89Utm32ToWgs84(x, y));
      if (converted.some(point => point === null)) return null;
      rings.push(converted.map(point => [point!.lon, point!.lat]));
    }
    out.push(rings);
  }
  return out.length === 1 ? { type: "Polygon", coordinates: out[0]! } : { type: "MultiPolygon", coordinates: out };
}

const temporal = (now: string): string => `registreringstid: ${JSON.stringify(now)}, virkningstid: ${JSON.stringify(now)}`;
const ID_BATCH = 100;

/**
 * MAT_Jordstykke has no geometry filter (the published MAT schema rejects `geometriIBoundingBox`). Spatial filtering is
 * `geometri: {intersects: {wkt, crs}}` on MAT_Lodflade, in the register's own CRS (EPSG:25832), so the WGS84 box is
 * projected to a UTM32 rectangle first. Matrikelnummer, ejerlav and BFE are then joined by id in `lookup`.
 * Any error, GraphQL error or malformed node makes the whole response `unavailable`; it never returns partial guesses.
 */
export function parcelsQuery(bbox: Bbox, now: string): string | null {
  const sw = wgs84ToEtrs89Utm32(bbox.minLat, bbox.minLon), ne = wgs84ToEtrs89Utm32(bbox.maxLat, bbox.maxLon);
  if (!sw || !ne) return null;
  const [x0, y0, x1, y1] = [sw.easting, sw.northing, ne.easting, ne.northing].map(n => n.toFixed(1));
  const wkt = `POLYGON((${x0} ${y0}, ${x1} ${y0}, ${x1} ${y1}, ${x0} ${y1}, ${x0} ${y0}))`;
  return `query { MAT_Lodflade(first: ${MAX_PARCELS + 1}, ${temporal(now)}, where: {status: {eq: "Gældende"}, geometri: {intersects: {crs: 25832, wkt: ${JSON.stringify(wkt)}}}}) {
    nodes { jordstykkeLokalId geometri { wkt crs } } } }`;
}

/** Server-side only: the response is deliberately generic, so without this the real cause (bad filter, 401, 400) is invisible. */
function logUnavailable(reason: string): void {
  console.warn(`[parcel-map] unavailable: ${reason.slice(0, 600)}`);
}

async function graphql(key: string, query: string): Promise<Record<string, unknown>> {
  const result = record(await fetchJson<unknown>(`${GRAPHQL}?${new URLSearchParams({ apiKey: key })}`, {
    method: "POST", body: JSON.stringify({ query }), headers: { "Content-Type": "application/json" }, timeoutMs: TIMEOUT, attempts: 1,
  }));
  if (result.errors || !result.data) {
    const messages = Array.isArray(result.errors) ? result.errors.map(e => text(record(e).message) ?? "unknown error").join(" | ") : "response had no data";
    throw new Error(`GraphQL: ${messages}`);
  }
  return record(result.data);
}

/**
 * Joins one register by `id_lokalId`, batching to the register's 100-value `in` limit. The service rejects aliases and
 * queries with several root fields, so every batch is its own request with a single, un-aliased root field.
 */
async function lookup(key: string, root: string, fields: string, ids: string[], now: string): Promise<Map<string, Record<string, unknown>>> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_BATCH) batches.push(ids.slice(i, i + ID_BATCH));
  const results = await Promise.all(batches.map(async batch => {
    const data = await graphql(key, `query { ${root}(first: ${ID_BATCH}, ${temporal(now)}, where: {id_lokalId: {in: ${JSON.stringify(batch)}}}) { nodes { id_lokalId ${fields} } } }`);
    const list = record(data[root]).nodes;
    if (!Array.isArray(list)) throw new Error(`${root} response had no nodes`);
    return list;
  }));
  const found = new Map<string, Record<string, unknown>>();
  for (const raw of results.flat()) { const node = record(raw), nodeId = id(node.id_lokalId); if (nodeId) found.set(nodeId, node); }
  return found;
}

export async function getParcelsInView(bbox: Bbox): Promise<ParcelMapResponse> {
  if (parcelMapMockMode()) return mockParcels(bbox);
  const unavailable: ParcelMapResponse = { status: "unavailable", source: "datafordeler", parcels: [], truncated: false };
  const key = process.env.DATAFORDELER_API_KEY?.trim();
  const now = new Date().toISOString();
  const query = key ? parcelsQuery(bbox, now) : null;
  if (!key || !query) { logUnavailable(!key ? "DATAFORDELER_API_KEY is not set" : "bbox could not be projected to ETRS89 UTM32"); return unavailable; }
  try {
    const list = record(record((await graphql(key, query)).MAT_Lodflade)).nodes;
    if (!Array.isArray(list)) { logUnavailable("response had no MAT_Lodflade.nodes"); return unavailable; }
    // A parcel can have several surface parts; group them so each parcel is one feature.
    const shapes = new Map<string, [number, number][][][]>();
    for (const raw of list.slice(0, MAX_PARCELS)) {
      const node = record(raw), parcelId = id(node.jordstykkeLokalId), shape = parseCadastralGeometry(node.geometri);
      if (!parcelId || !shape) { logUnavailable(parcelId ? `unparseable geometry on parcel ${parcelId}` : "malformed lodflade node"); return unavailable; }
      shapes.set(parcelId, [...(shapes.get(parcelId) ?? []), ...shape.polygons]);
    }
    const parcelRows = await lookup(key, "MAT_Jordstykke", "matrikelnummer ejerlavLokalId samletFastEjendomLokalId", [...shapes.keys()], now);
    const [estates, districts] = await Promise.all([
      lookup(key, "MAT_SamletFastEjendom", "BFEnummer", [...new Set([...parcelRows.values()].map(r => id(r.samletFastEjendomLokalId)).filter((v): v is string => v !== null))], now),
      lookup(key, "MAT_Ejerlav", "ejerlavsnavn", [...new Set([...parcelRows.values()].map(r => id(r.ejerlavLokalId)).filter((v): v is string => v !== null))], now),
    ]);
    const parcels: ParcelMapParcel[] = [];
    for (const [parcelId, polygons] of shapes) {
      const row = parcelRows.get(parcelId);
      if (!row) { logUnavailable(`no MAT_Jordstykke for parcel ${parcelId}`); return unavailable; }
      const geometry = toWgs84(polygons);
      if (!geometry) { logUnavailable(`coordinate conversion failed on parcel ${parcelId}`); return unavailable; }
      const estate = estates.get(id(row.samletFastEjendomLokalId) ?? ""), district = districts.get(id(row.ejerlavLokalId) ?? "");
      parcels.push({ id: parcelId, bfeNumber: id(estate?.BFEnummer), number: text(row.matrikelnummer), district: text(district?.ejerlavsnavn), geometry });
    }
    return { status: "available", source: "datafordeler", parcels, truncated: list.length > MAX_PARCELS };
  } catch (error) {
    logUnavailable(error instanceof Error ? `${error.name}: ${error.message}` : "request failed");
    return unavailable;
  }
}

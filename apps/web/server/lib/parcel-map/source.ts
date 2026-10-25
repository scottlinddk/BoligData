import type { ParcelMapParcel, ParcelMapResponse } from "../../../../../packages/shared/src/types/parcel-map.js";
import { fetchJson } from "../crawl/http.js";
import { etrs89Utm32ToWgs84, wgs84ToEtrs89Utm32 } from "../geo/etrs89-utm32.js";
import { parseCadastralGeometry } from "../cadastral/geometry.js";
import { MAX_PARCELS, type Bbox } from "./bbox.js";

const GRAPHQL = "https://graphql.datafordeler.dk/Flexible/v2";
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

/**
 * UNVERIFIED against the live service: the spatial filter below is the one assumption in this module.
 * Everything else reuses the MAT/Flexible field names the cadastral report already depends on. Any error,
 * GraphQL error or malformed node makes the whole response `unavailable`; it never returns partial guesses.
 */
export function parcelsQuery(bbox: Bbox, now: string): string | null {
  const sw = wgs84ToEtrs89Utm32(bbox.minLat, bbox.minLon), ne = wgs84ToEtrs89Utm32(bbox.maxLat, bbox.maxLon);
  if (!sw || !ne) return null;
  const temporal = `registreringstid: ${JSON.stringify(now)}, virkningstid: ${JSON.stringify(now)}`;
  const box = `{minX: ${sw.easting.toFixed(1)}, minY: ${sw.northing.toFixed(1)}, maxX: ${ne.easting.toFixed(1)}, maxY: ${ne.northing.toFixed(1)}}`;
  return `query { MAT_Jordstykke(first: ${MAX_PARCELS + 1}, ${temporal}, where: {status: {eq: "Gældende"}, geometriIBoundingBox: ${box}}) {
    nodes { id_lokalId matrikelnummer samletFastEjendomLokalId
      jordstykkeLiggerIEjerlav { ejerlavsnavn }
      jordstykkeSamlesISamletFastEjendom(first: 2, where: {status: {eq: "Gældende"}}) { nodes { BFEnummer } }
      lodfladeRepraesentationJordstykke(first: 5, where: {status: {eq: "Gældende"}}) { nodes { geometri { wkt crs type } } }
    } } }`;
}

export async function getParcelsInView(bbox: Bbox): Promise<ParcelMapResponse> {
  if (parcelMapMockMode()) return mockParcels(bbox);
  const unavailable: ParcelMapResponse = { status: "unavailable", source: "datafordeler", parcels: [], truncated: false };
  const key = process.env.DATAFORDELER_API_KEY?.trim();
  const query = key ? parcelsQuery(bbox, new Date().toISOString()) : null;
  if (!key || !query) return unavailable;
  try {
    const result = record(await fetchJson<unknown>(`${GRAPHQL}?${new URLSearchParams({ apiKey: key })}`, {
      method: "POST", body: JSON.stringify({ query }), headers: { "Content-Type": "application/json" }, timeoutMs: TIMEOUT, attempts: 1,
    }));
    const list = record(record(record(result.data).MAT_Jordstykke)).nodes;
    if (result.errors || !Array.isArray(list)) return unavailable;
    const parcels: ParcelMapParcel[] = [];
    for (const raw of list.slice(0, MAX_PARCELS)) {
      const node = record(raw), parcelId = id(node.id_lokalId);
      const estates = record(record(node.jordstykkeSamlesISamletFastEjendom)).nodes;
      const bfes = new Set((Array.isArray(estates) ? estates : []).map(e => id(record(e).BFEnummer)).filter((v): v is string => v !== null));
      const parts = record(record(node.lodfladeRepraesentationJordstykke)).nodes;
      if (!parcelId || !Array.isArray(parts)) return unavailable;
      const shapes = parts.map(part => parseCadastralGeometry(record(part).geometri));
      if (!shapes.length || shapes.some(shape => shape === null)) return unavailable;
      const geometry = toWgs84(shapes.flatMap(shape => shape!.polygons));
      if (!geometry) return unavailable;
      parcels.push({ id: parcelId, bfeNumber: bfes.size === 1 ? [...bfes][0]! : null, number: text(node.matrikelnummer), district: text(record(node.jordstykkeLiggerIEjerlav).ejerlavsnavn), geometry });
    }
    return { status: "available", source: "datafordeler", parcels, truncated: list.length > MAX_PARCELS };
  } catch { return unavailable; }
}

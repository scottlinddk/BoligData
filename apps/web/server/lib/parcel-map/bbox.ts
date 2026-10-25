/** Largest viewport the parcel endpoint will serve (degrees). ~1.1 km north-south, enough for a street-level view. */
export const MAX_BBOX_SPAN_DEG = 0.012;
export const MAX_PARCELS = 400;
// Denmark incl. Bornholm, same envelope idea as the cadastral geometry parser.
const DK = { minLon: 7.9, maxLon: 15.3, minLat: 54.5, maxLat: 57.8 };

export interface Bbox { minLon: number; minLat: number; maxLon: number; maxLat: number }

/** `minLon,minLat,maxLon,maxLat`. Null for anything malformed, outside Denmark, or too large to answer cheaply. */
export function parseParcelBbox(value: unknown): Bbox | null {
  if (typeof value !== "string") return null;
  const parts = value.split(",");
  if (parts.length !== 4 || parts.some(part => !/^-?\d{1,3}(?:\.\d{1,8})?$/.test(part))) return null;
  const [minLon, minLat, maxLon, maxLat] = parts.map(Number) as [number, number, number, number];
  if (!(minLon < maxLon && minLat < maxLat)) return null;
  if (minLon < DK.minLon || maxLon > DK.maxLon || minLat < DK.minLat || maxLat > DK.maxLat) return null;
  if (maxLon - minLon > MAX_BBOX_SPAN_DEG * 2 || maxLat - minLat > MAX_BBOX_SPAN_DEG) return null;
  return { minLon, minLat, maxLon, maxLat };
}

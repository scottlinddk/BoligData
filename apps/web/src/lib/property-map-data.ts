import type { GeoJSONSourceSpecification } from "maplibre-gl";
import type { Property } from "@shared/types/index";
import { parseSearchBoundary, type SearchBoundaryPoint } from "@shared/utils/search-boundary";

type MapFeatureCollection = Extract<GeoJSONSourceSpecification["data"], { type: "FeatureCollection" }>;

export function boundaryMapData(saved: readonly SearchBoundaryPoint[] | null, draft: readonly SearchBoundaryPoint[]): MapFeatureCollection {
  const features: MapFeatureCollection["features"] = [];
  if (saved) features.push({ type: "Feature", properties: { kind: "saved" }, geometry: { type: "Polygon", coordinates: [[...saved, saved[0]!]] } });
  if (draft.length >= 3) features.push({ type: "Feature", properties: { kind: "draft-fill" }, geometry: { type: "Polygon", coordinates: [[...draft, draft[0]!]] } });
  if (draft.length >= 2) features.push({ type: "Feature", properties: { kind: "draft-line" }, geometry: { type: "LineString", coordinates: [...draft] } });
  draft.forEach((point, index) => features.push({ type: "Feature", properties: { kind: "vertex", index }, geometry: { type: "Point", coordinates: point } }));
  return { type: "FeatureCollection", features };
}

export function validMapProperty(property: Property): boolean {
  return Number.isFinite(property.lon) && Number.isFinite(property.lat) && Math.abs(property.lon) <= 180 && Math.abs(property.lat) <= 85.051129;
}

export function propertyMapData(properties: readonly Property[]): MapFeatureCollection {
  const seen = new Set<string>();
  return {
    type: "FeatureCollection",
    features: properties.filter((property) => {
      if (!validMapProperty(property) || seen.has(property.id)) return false;
      seen.add(property.id);
      return true;
    }).map((property) => ({ type: "Feature", properties: { propertyId: property.id }, geometry: { type: "Point", coordinates: [property.lon, property.lat] } })),
  };
}

/** World-wrapped or degenerate viewports must never become a different search area. */
export function viewportSearchBoundary(west: number, south: number, east: number, north: number): SearchBoundaryPoint[] | null {
  if (!(west < east && south < north)) return null;
  return parseSearchBoundary([[west, south], [east, south], [east, north], [west, north]]);
}

export function mapPriceLabel(price: number, language: "da" | "en"): string {
  if (!(price > 0) || !Number.isFinite(price)) return language === "da" ? "Pris ukendt" : "Price unknown";
  const locale = language === "da" ? "da-DK" : "en-GB";
  if (price >= 1_000_000) {
    const amount = (price / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 3 });
    return language === "da" ? `${amount} mio.` : `DKK ${amount}m`;
  }
  return language === "da" ? `${price.toLocaleString(locale)} kr.` : `DKK ${price.toLocaleString(locale)}`;
}

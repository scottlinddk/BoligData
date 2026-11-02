import type { HouseSearchEntry } from "@shared/types/house-search";

/**
 * `count`: every logged listing weighs the same, so the map shows where the family is *looking*.
 * `interest`: weighs by rating and status, so the map shows where it *wants* to be.
 */
export type HeatmapWeight = "count" | "interest";

export interface HeatPointProperties {
  id: string;
  label: string;
  weight: number;
  status: HouseSearchEntry["status"];
  price: number | null;
  rooms: number | null;
  rating: number | null;
}

export interface HeatFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: HeatPointProperties;
  }>;
}

/** Rejected listings barely warm the map; unrated ones count as lukewarm so they are not erased. */
export const REJECTED_WEIGHT = 0.1;
export const UNRATED_WEIGHT = 0.5;

export function entryWeight(entry: Pick<HouseSearchEntry, "status" | "rating">, mode: HeatmapWeight): number {
  if (mode === "count") return 1;
  if (entry.status === "rejected") return REJECTED_WEIGHT;
  return entry.rating === null ? UNRATED_WEIGHT : entry.rating / 5;
}

export function hasLocation(entry: HouseSearchEntry): entry is HouseSearchEntry & { lat: number; lon: number } {
  return entry.lat !== null && entry.lon !== null;
}

export function toFeatureCollection(entries: HouseSearchEntry[], mode: HeatmapWeight): HeatFeatureCollection {
  return {
    type: "FeatureCollection",
    features: entries.filter(hasLocation).map((e) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [e.lon, e.lat] },
      properties: {
        id: e.id,
        label: e.addressLabel,
        weight: entryWeight(e, mode),
        status: e.status,
        price: e.askingPriceDkk,
        rooms: e.rooms,
        rating: e.rating,
      },
    })),
  };
}

/** [west, south, east, north] around every located entry, or null when none can be drawn. */
export function entryBounds(entries: HouseSearchEntry[]): [number, number, number, number] | null {
  const located = entries.filter(hasLocation);
  if (located.length === 0) return null;
  return [
    Math.min(...located.map((e) => e.lon)),
    Math.min(...located.map((e) => e.lat)),
    Math.max(...located.map((e) => e.lon)),
    Math.max(...located.map((e) => e.lat)),
  ];
}

export const DEFAULT_PAGE_SIZE = 50;

/**
 * Page-size choices offered in the UI. The server enforces its own ceiling
 * (SEARCH_MAX_PAGE_SIZE, default 100) independent of this list.
 */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export const DEFAULT_MAP_CENTER: [number, number] = [9.9217, 57.0488]; // Aalborg, [lon, lat]
export const DEFAULT_MAP_ZOOM = 11;

/** SW/NE corners covering the whole of Denmark (incl. Bornholm) — the map's default view. */
export const DENMARK_BOUNDS: [[number, number], [number, number]] = [
  [7.6, 54.5],
  [15.5, 57.8],
];

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/**
 * Sort option values. Each value doubles as a translation key suffix
 * (`sort.<value>`) so labels are resolved through i18n at render time.
 */
export const SORT_OPTIONS = [
  "listingDate:desc",
  "pricePerSqm:asc",
  "pricePerSqm:desc",
  "price:asc",
  "price:desc",
  "daysOnMarket:asc",
] as const;

export type SortOptionValue = (typeof SORT_OPTIONS)[number];

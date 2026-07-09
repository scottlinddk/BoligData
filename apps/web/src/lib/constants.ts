export const DEFAULT_PAGE_SIZE = 50;

export const DEFAULT_MAP_CENTER: [number, number] = [9.9217, 57.0488]; // Aalborg, [lon, lat]
export const DEFAULT_MAP_ZOOM = 11;

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

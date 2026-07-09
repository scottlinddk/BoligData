export const DEFAULT_PAGE_SIZE = 50;

export const DEFAULT_MAP_CENTER: [number, number] = [9.9217, 57.0488]; // Aalborg, [lon, lat]
export const DEFAULT_MAP_ZOOM = 11;

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "listingDate:desc", label: "Newest first" },
  { value: "pricePerSqm:asc", label: "Price/sqm (low to high)" },
  { value: "pricePerSqm:desc", label: "Price/sqm (high to low)" },
  { value: "price:asc", label: "Price (low to high)" },
  { value: "price:desc", label: "Price (high to low)" },
  { value: "daysOnMarket:asc", label: "Days on market" },
];

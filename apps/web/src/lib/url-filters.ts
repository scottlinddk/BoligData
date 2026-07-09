import type { PropertyFilters, SortDirection, SortField } from "@shared/types/index";

export interface FiltersWithSort extends PropertyFilters {
  sortField: SortField;
  sortDirection: SortDirection;
}

const DEFAULTS: FiltersWithSort = {
  location: null,
  minPrice: null,
  maxPrice: null,
  minSqm: null,
  maxSqm: null,
  maxDaysOnMarket: null,
  minBuildingYear: null,
  maxBuildingYear: null,
  sortField: "listingDate",
  sortDirection: "desc",
};

function readNumber(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function readString(params: URLSearchParams, key: string): string | null {
  const raw = params.get(key);
  return raw === null || raw === "" ? null : raw;
}

export function parseFilters(params: URLSearchParams): FiltersWithSort {
  return {
    location: readString(params, "location"),
    minPrice: readNumber(params, "minPrice"),
    maxPrice: readNumber(params, "maxPrice"),
    minSqm: readNumber(params, "minSqm"),
    maxSqm: readNumber(params, "maxSqm"),
    maxDaysOnMarket: readNumber(params, "maxDaysOnMarket"),
    minBuildingYear: readNumber(params, "minBuildingYear"),
    maxBuildingYear: readNumber(params, "maxBuildingYear"),
    sortField: (readString(params, "sortField") as SortField) ?? DEFAULTS.sortField,
    sortDirection: (readString(params, "sortDirection") as SortDirection) ?? DEFAULTS.sortDirection,
  };
}

export function serializeFilters(filters: Partial<FiltersWithSort>): URLSearchParams {
  const params = new URLSearchParams();
  const merged = { ...DEFAULTS, ...filters };
  for (const [key, value] of Object.entries(merged)) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  return params;
}

export function defaultFilters(): FiltersWithSort {
  return { ...DEFAULTS };
}

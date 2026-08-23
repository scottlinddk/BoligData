import type { PropertyFilters, PropertyType, SortDirection, SortField } from "@shared/types/index";

export interface FiltersWithSort extends PropertyFilters {
  sortField: SortField;
  sortDirection: SortDirection;
}

const PROPERTY_TYPES: readonly PropertyType[] = [
  "villa",
  "apartment",
  "terraced_house",
  "summer_house",
  "farm",
  "villa_apartment",
  "cooperative",
  "holiday_plot",
  "residential_plot",
  "houseboat",
  "other",
];

const DEFAULTS: FiltersWithSort = {
  location: null,
  postnummer: null,
  propertyTypes: null,
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

function readPropertyTypes(params: URLSearchParams, key: string): PropertyType[] | null {
  const raw = params.get(key);
  if (!raw) return null;
  const values = raw.split(",").filter((t): t is PropertyType => (PROPERTY_TYPES as readonly string[]).includes(t));
  return values.length > 0 ? values : null;
}

export function parseFilters(params: URLSearchParams): FiltersWithSort {
  return {
    location: readString(params, "location"),
    postnummer: readString(params, "postnummer"),
    propertyTypes: readPropertyTypes(params, "propertyTypes"),
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
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      params.set(key, value.join(","));
      continue;
    }
    params.set(key, String(value));
  }
  return params;
}

export function defaultFilters(): FiltersWithSort {
  return { ...DEFAULTS };
}

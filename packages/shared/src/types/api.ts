import type {
  AlertFrequency,
  Property,
  PropertyFilters,
  SortDirection,
  SortField,
} from "./index";

export type { SortDirection, SortField };

export interface SearchPropertiesQuery extends Partial<PropertyFilters> {
  sortField?: SortField;
  sortDirection?: SortDirection;
  limit?: number;
  offset?: number;
}

export interface SearchPropertiesResponse {
  properties: Property[];
  total: number;
  limit: number;
  offset: number;
}

export interface PropertyDetailResponse {
  property: Property;
  enrichment: import("./index").Enrichment | null;
}

export interface ComparableEntry {
  property: Property;
  soldDate: string;
  price: number;
  pricePerSqm: number;
  distanceMeters: number;
}

export interface ComparablesResponse {
  comparables: ComparableEntry[];
  neighborhoodAvgPricePerSqm: number | null;
}

export interface CreateSearchBody {
  name: string;
  filters: PropertyFilters;
  alertFrequency: AlertFrequency;
}

export interface UpdateAlertBody {
  alertFrequency: AlertFrequency;
}

export interface ApiErrorResponse {
  error: string;
}

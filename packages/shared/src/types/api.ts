import type {
  AlertFrequency,
  Property,
  PropertyFilters,
  PropertySummary,
  SortDirection,
  SortField,
} from "./index.js";

export type { SortDirection, SortField };

export interface SearchPropertiesQuery extends Partial<PropertyFilters> {
  sortField?: SortField;
  sortDirection?: SortDirection;
  limit?: number;
  offset?: number;
}

export interface SearchPropertiesResponse {
  /** Whether the request carried a valid session — determines which of the two arrays below is populated. */
  authenticated: boolean;
  /** Full listing data. Populated only when authenticated is true. */
  properties: Property[];
  /** Address-only listing data. Populated only when authenticated is false. */
  summaries: PropertySummary[];
  total: number;
  limit: number;
  offset: number;
  page: number;
  totalPages: number;
}

export interface PropertyDetailResponse {
  property: Property;
  enrichment: import("./index.js").Enrichment | null;
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

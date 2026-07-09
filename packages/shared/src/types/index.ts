export type ListingSource = "boligsiden" | "boliga";

export type PropertyStatus = "active" | "sold" | "withdrawn";

export type PropertyType =
  | "villa"
  | "apartment"
  | "terraced_house"
  | "summer_house"
  | "farm"
  | "other";

export interface Property {
  id: string;
  address: string;
  municipality: string;
  postalCode: string | null;
  price: number;
  sqm: number;
  listingDate: string; // ISO date
  listingSource: ListingSource;
  externalId: string;
  lat: number;
  lon: number;
  status: PropertyStatus;
  buildingYear: number | null;
  propertyType: PropertyType;
  rooms: number | null;
  imageUrls: string[];
  description: string | null;
  agentName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SoldPriceEntry {
  soldDate: string; // ISO date
  price: number;
  pricePerSqm: number;
}

export interface CalculatedMetrics {
  pricePerSqm: number;
  neighborhoodPricePerSqm: number | null;
  priceTrendPercent: number | null; // vs neighborhood, last 12mo
  estimatedYieldPercent: number | null;
  daysOnMarket: number;
}

export interface RiskFlags {
  noiseExposureLden: number | null;
  encumbranceCheckRequired: boolean;
  sewerSeparationRequired: boolean;
  oilTankRisk: boolean;
  soilContaminationRisk: boolean;
}

export interface SchoolTransportInfo {
  nearestSchoolName: string | null;
  nearestSchoolDistanceMeters: number | null;
  nearestStationName: string | null;
  nearestStationDistanceMeters: number | null;
}

export interface BbrData {
  yearBuilt: number | null;
  renovationYear: number | null;
  energyLabel: string | null;
  areaSqm: number | null;
  buildingType: string | null;
}

export type EnrichmentSource = "mock" | "datafordeler" | "ois" | "vejdirektoratet";

export interface Enrichment {
  id: string;
  propertyId: string;
  bbrData: BbrData;
  soldPriceHistory: SoldPriceEntry[];
  calculatedMetrics: CalculatedMetrics;
  riskFlags: RiskFlags;
  schoolTransport: SchoolTransportInfo | null;
  source: EnrichmentSource;
  enrichedAt: string;
}

export type UserRole = "investor" | "advisor";

export interface UserProfile {
  id: string;
  role: UserRole;
  organizationName: string | null;
  createdAt: string;
}

export interface PropertyFilters {
  location: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  minSqm: number | null;
  maxSqm: number | null;
  maxDaysOnMarket: number | null;
  minBuildingYear: number | null;
  maxBuildingYear: number | null;
}

export type SortField = "listingDate" | "pricePerSqm" | "price" | "daysOnMarket";
export type SortDirection = "asc" | "desc";

export type AlertFrequency = "none" | "immediate" | "daily" | "weekly";

export interface SavedSearch {
  id: string;
  userId: string;
  name: string;
  filters: PropertyFilters;
  alertFrequency: AlertFrequency;
  createdAt: string;
  lastAlertAt: string | null;
}

export type EmailStatus = "pending" | "sent" | "failed";

export interface Alert {
  id: string;
  searchId: string;
  sentAt: string;
  propertyIds: string[];
  emailStatus: EmailStatus;
}

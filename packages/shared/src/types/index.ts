export type ListingSource = "boligsiden" | "boliga";

export type PropertyStatus = "active" | "sold" | "withdrawn";

export type PropertyType =
  | "villa"
  | "apartment"
  | "terraced_house"
  | "summer_house"
  | "farm"
  | "other";

/** What an anonymous (not signed-in) search result shows — name only, no price/location/etc. */
export interface PropertySummary {
  id: string;
  address: string;
}

/** A single pre-sized image variant a source may provide (e.g. Boligsiden's imageSources). */
export interface ListingImageSource {
  url: string;
  width: number;
  height: number;
}

export interface ListingImage {
  url: string; // fallback/original, used when no sized `sources` are available
  category: "photo" | "floorplan" | "other";
  sources: ListingImageSource[];
}

export type ZoneStatus = "byzone" | "landzone" | "sommerhusomraade";

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
  images: ListingImage[];
  description: string | null;
  agentName: string | null;
  agentUserId: string | null;
  isPromoted: boolean;
  promotedAt: string | null;
  promotedBy: string | null;
  /** Stable address UUID from DAWA/Adressevælger — the cross-registry join key BBR and Plandata key off of. */
  idLokalid: string | null;
  /** Cadastral parcel number (matrikelnummer), from DAWA/DAR. */
  matrikelnr: string | null;
  /** Cadastral district (ejerlav), from DAWA/DAR. */
  ejerlav: string | null;
  zone: ZoneStatus | null;
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

export type SoilContaminationClassification = "v1" | "v2" | "none" | "unknown";

/** Danmarks Miljøportal V1/V2 status (authoritative) plus GEUS jordart context (never overrides the classification). */
export interface SoilContamination {
  classification: SoilContaminationClassification;
  jordart: string | null;
}

export type OilTankRiskSource = "bbr" | "heuristic";

export interface RiskFlags {
  noiseExposureLden: number | null;
  /** Always true in real (non-mock) mode: tinglysning.dk has no open API, so this stays advisory — see encumbranceLookupUrl. */
  encumbranceCheckRequired: boolean;
  /** Deep link to tinglysning.dk built from the property's matrikelnr/ejerlav, null when cadastral data is unavailable. */
  encumbranceLookupUrl: string | null;
  /** Always true: no unified municipal spildevandsplan API exists, so this stays advisory — see sewerSeparationLookupUrl. */
  sewerSeparationCheckRequired: boolean;
  /** Deep link to the property's municipality spildevandsplan info, null when the municipality isn't in the lookup table. */
  sewerSeparationLookupUrl: string | null;
  oilTankRisk: boolean;
  /** Whether oilTankRisk came from BBR's real heating-installation data or the building-year heuristic fallback. */
  oilTankRiskSource: OilTankRiskSource;
  soilContamination: SoilContamination;
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
  /** Raw BBR varmeinstallation code/label (e.g. "oliefyr"), null until real Datafordeler BBR access lands. */
  heatingInstallation: string | null;
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

export type UserRole = "admin" | "user" | "advisor" | "agent";

export interface UserProfile {
  id: string;
  role: UserRole;
  organizationName: string | null;
  createdAt: string;
}

export type InvitationStatus = "pending" | "accepted" | "revoked";

export interface Invitation {
  id: string;
  email: string;
  role: UserRole;
  invitedBy: string | null;
  status: InvitationStatus;
  invitedAt: string;
  acceptedAt: string | null;
}

/** A user_profiles row joined with its auth.users email, for admin listings. */
export interface AdminUser {
  id: string;
  email: string;
  role: UserRole;
  organizationName: string | null;
  createdAt: string;
  /** True once the invitee has confirmed their email (accepted their invite). */
  inviteAccepted: boolean;
}

export interface FavoriteProperty {
  id: string;
  userId: string;
  propertyId: string;
  createdAt: string;
}

export interface AdvisorConnection {
  id: string;
  advisorId: string;
  userId: string;
  createdAt: string;
  createdBy: string | null;
}

export interface ListingApproval {
  id: string;
  propertyId: string;
  advisorId: string;
  userId: string;
  note: string | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  searchId: string;
  propertyId: string;
  alertId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface PropertyFilters {
  location: string | null;
  postnummer: string | null;
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

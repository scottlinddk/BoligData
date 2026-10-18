export type ListingSource = "boligsiden" | "boliga";

export type PropertyStatus = "active" | "sold" | "withdrawn";

export type PropertyType =
  | "villa"
  | "apartment"
  | "terraced_house"
  | "summer_house"
  | "farm"
  | "villa_apartment"
  | "cooperative"
  | "holiday_plot"
  | "residential_plot"
  | "houseboat"
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
  listingDate: string | null; // Documented ISO date; never the crawler's first observation
  dataMode?: "real" | "demo" | "mock" | "unknown";
  firstSeenAt?: string | null;
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
  /**
   * Canonical URL of this listing on the source site (boliga.dk /
   * boligsiden.dk) — what the "go to broker listing" link points at. Always
   * an absolute http(s) URL: the crawl validates the scheme before storing,
   * since this value goes straight into an `href`. Null when the source
   * record carried no usable link, or for rows written before migration 020;
   * consumers must hide the link rather than fabricate one.
   */
  listingUrl: string | null;
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
  /** BFE (Bestemt Fast Ejendom) number — the identifier VUR indexes valuations by, from DAWA/DAR. */
  bfeNummer: string | null;
  /** Registered land area (sqm) from Matriklen's Jordstykke entity, joined via matrikelnr/ejerlav. */
  registeredAreaSqm: number | null;
  /**
   * Not a `properties` table column — attached by search/detail endpoints
   * from the property's `enrichments` row (batch-fetched alongside the
   * property list) so listing cards can show energy label/heating without a
   * second round-trip per card. Null when enrichment hasn't run yet.
   */
  bbrData: BbrData | null;
  /**
   * Like `bbrData`, attached by search/detail endpoints from the property's
   * `enrichments` row so listing cards can show the overall OK/Bemærk/Ukendt
   * risk chip. Null when enrichment hasn't run yet.
   */
  riskFlags: RiskFlags | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * One registered sale of the property (OIS/tinglysning, via Boligsiden).
 * `saleType` matters for due diligence: only `normal` is an arm's-length
 * market price — a `family` transfer or an `auction` says little about what
 * the property is worth, so the UI must be able to tell them apart rather
 * than averaging them together. Optional because rows written before the
 * Boligsiden registration mapping existed don't carry it.
 */
export type SaleType = "normal" | "family" | "auction" | "other";

export interface SoldPriceEntry {
  soldDate: string; // ISO date
  price: number;
  pricePerSqm: number | null;
  saleType?: SaleType;
  registrationId?: string;
  residentialArea?: number;
  areaDefinition?: "residential" | "weighted" | "unknown";
}

export interface CalculatedMetrics {
  pricePerSqm: number;
  neighborhoodPricePerSqm: number | null;
  priceTrendPercent: number | null; // vs neighborhood, last 12mo
  estimatedYieldPercent: number | null;
  daysOnMarket: number | null;
}

export type SoilContaminationClassification = "v1" | "v2" | "none" | "unknown";

/** Danmarks Miljøportal V1/V2 status (authoritative) plus GEUS jordart context (never overrides the classification). */
export interface SoilContamination {
  classification: SoilContaminationClassification;
  jordart: string | null;
}

export type OilTankRiskSource = "bbr" | "heuristic";

/** Which kind of mapped noise a band came from (Miljøstyrelsen's EU noise mapping layers). */
export type NoiseBandSource = "roads_in_towns" | "major_roads" | "rail_in_towns" | "major_rail";

/** A mapped Lden band at the address point, e.g. 60–64 dB. `upperDb` null is the open top band (75+). */
export interface NoiseBand {
  lowerDb: number;
  upperDb: number | null;
  source: NoiseBandSource;
}

export interface RiskFlags {
  /** Legacy point value. Newer rows leave it null and use `noiseBand`, since the maps give bands, not a dB reading. */
  noiseExposureLden: number | null;
  /** The loudest mapped noise band at the address point; null with `noiseChecked` means no mapped zone covers it. */
  noiseBand?: NoiseBand | null;
  /** True when the noise maps were actually queried for this address. Older rows lack it. */
  noiseChecked?: boolean;
  /** Always true in real (non-mock) mode: tinglysning.dk has no open API, so this stays advisory — see encumbranceLookupUrl. */
  encumbranceCheckRequired: boolean;
  /** Deep link to tinglysning.dk built from the property's matrikelnr/ejerlav, null when cadastral data is unavailable. */
  encumbranceLookupUrl: string | null;
  /** Always true: no unified municipal spildevandsplan API exists, so this stays advisory — see sewerSeparationLookupUrl. */
  sewerSeparationCheckRequired: boolean;
  /** Deep link to the property's municipality spildevandsplan info, null when the municipality isn't in the lookup table. */
  sewerSeparationLookupUrl: string | null;
  /** Advisory deep link to the municipality's WebLager building case search page, null when the municipality is not verified. Older rows lack it. */
  buildingCaseArchiveUrl: string | null;
  oilTankRisk: boolean;
  /** Whether oilTankRisk came from BBR's real heating-installation data or the building-year heuristic fallback. */
  oilTankRiskSource: OilTankRiskSource;
  soilContamination: SoilContamination;
  /** Deep link to the jordforureningsattest report on jord.miljoeportal.dk, built from the property's ejerlavskode/matrikelnr — null when cadastral data is unavailable. */
  soilContaminationAttestUrl: string | null;
  /** The contamination register's own name for the mapped site, when V1/V2 hit. Older rows lack it. */
  soilContaminationSiteName?: string | null;
  /** Whether oil heating is registered in BBR, as opposed to the heating being unknown. Older rows lack it. */
  heatingInstallation?: string | null;
  /** Tanks BBR registers on the property (`BBR_TekniskAnlaeg`). Null or absent: the tank register was not asked. */
  oilTanks?: OilTankRegistry | null;
  /** What Matriklen (MAT) registers on the land that a buyer should know about. Null or absent: not asked. */
  landRegistration?: LandRegistration | null;
  /** The public valuation (VUR), for comparison with the price. Null or absent: not asked, or none registered. */
  valuation?: ValuationCheck | null;
}

/** One tank BBR registers as a technical installation (classification 1110, "tank"). */
export interface OilTankRecord {
  /** Capacity in litres. */
  sizeLiters: number | null;
  /** Year the tank was made (tek067), the year its decommissioning deadline counts from. */
  manufacturedYear: number | null;
  /** Year the installation was established (tek024). */
  installedYear: number | null;
  /** Deadline for decommissioning (tek035), ISO date. Past means the tank is overdue. */
  decommissionDeadline: string | null;
  /** Year it was decommissioned (tek072). Set, or a decommissioning code (tek028), means the tank is gone. */
  decommissionedYear: number | null;
  /** True when BBR records it as decommissioned: a decommissioning year or code, or a status other than built. */
  decommissioned: boolean;
  /** BBR's drift code: true "Drift", false "Ikke i drift", null when not stated. */
  inOperation: boolean | null;
  /** Raw BBR codes the checklist cannot decode without the code list: placement (tek027), content (tek034). */
  placementCode: string | null;
  contentCode: string | null;
}

export interface OilTankRegistry {
  tanks: OilTankRecord[];
}

/** Matriklen facts that bear on what the buyer can do with the land. Areas in m2. */
export interface LandRegistration {
  /** Sum of the registered area of the parcels, when the parcel list is complete. */
  totalAreaSqm: number | null;
  parcelCount: number;
  /** Fredskov (forest reserve): a duty to keep forest, and building is restricted. Null when no parcel carries it. */
  forestReserve: LandRestriction | null;
  /** Strandbeskyttelse (beach protection line). Null when no parcel carries it. */
  beachProtection: LandRestriction | null;
  /** Klitfredning (dune protection). Null when no parcel carries it. */
  duneProtection: LandRestriction | null;
  /** A parcel is entailed forest (majoratsskov). */
  entailedForest: boolean;
  /** Landbrugsnotering ("Familiebrug", "Landbrug", "Landbrug uden bygning"): a duty to farm. Null when not noted. */
  agriculturalNote: string | null;
  /** The land is a shared lot (fælleslod) serving several properties. */
  commonLot: boolean | null;
  /** The estate is a main property split into condominiums, so its land is not one owner's. */
  condominiumParent: boolean | null;
}

/** A land restriction Matriklen registers on parcels. The area is the sum over the parcels that state one. */
export interface LandRestriction {
  areaSqm: number;
}

/** The latest public valuation, and the one before it, in whole kroner. */
export interface ValuationCheck {
  year: number;
  propertyValueDkk: number | null;
  landValueDkk: number | null;
  previousYear: number | null;
  previousPropertyValueDkk: number | null;
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
  /** Number of storeys (byg054AntalEtager), null until real Datafordeler BBR access lands. */
  floors: number | null;
  /** Roof covering material (byg033Tagdækningsmateriale), null until real Datafordeler BBR access lands. */
  roofMaterial: string | null;
  /** Exterior wall material (byg032YdervæggensMateriale), null until real Datafordeler BBR access lands. */
  wallMaterial: string | null;
  /** Basement area in sqm, null until real Datafordeler BBR access lands. */
  basementSqm: number | null;
  /** Number of water-flushing toilets (enh065), null until real Datafordeler BBR access lands. */
  toiletCount: number | null;
  /** Number of bathrooms (enh066), null until real Datafordeler BBR access lands. */
  bathroomCount: number | null;
}

export type EnrichmentSource = "mock" | "datafordeler" | "ois" | "vejdirektoratet";

/** Official public property valuation (VUR/Ejendomsvurdering via Datafordeler), directly comparable to listing price. */
export interface PublicValuation {
  assessedPropertyValueDkk: number | null;
  assessedLandValueDkk: number | null;
  valuationYear: number | null;
}

/** Facts reported by a listing provider. These are separate from a direct
 * BBR/VUR lookup and must retain the listing source label in the UI. */
export interface ListingSourceFacts {
  yearBuilt: number | null;
  renovationYear: number | null;
  energyLabel: string | null;
  areaSqm: number | null;
  buildingType: string | null;
  /** Building storeys, only from an unambiguous residential building. The
   * listing's interior floor count and the apartment floor are distinct. */
  floors: number | null;
  roofMaterial: string | null;
  wallMaterial: string | null;
  heatingInstallation: string | null;
  /** Only listing-level basement area; a building total is not a unit area. */
  basementSqm: number | null;
  toiletCount: number | null;
  bathroomCount: number | null;
  /** Provider's lot area, not an independently verified Matriklen value. */
  landAreaSqm: number | null;
  /** Provider-reported assessment; unavailable year/land value stay null. */
  publicValuation: PublicValuation | null;
}

/** A fresh, identity-matched read of the provider's property listing. */
export interface ListingDetails {
  source: "boligsiden";
  sourceUrl: string;
  title: string | null;
  description: string | null;
  facts: ListingSourceFacts;
  fetchedAt: string;
}

export interface Enrichment {
  id: string;
  propertyId: string;
  bbrData: BbrData;
  soldPriceHistory: SoldPriceEntry[];
  calculatedMetrics: CalculatedMetrics;
  riskFlags: RiskFlags;
  schoolTransport: SchoolTransportInfo | null;
  publicValuation: PublicValuation | null;
  source: EnrichmentSource;
  enrichedAt: string;
  sourceStatus?: Record<string, {
    dataMode: "real" | "mock" | "unavailable";
    observedAt: string;
    method: string;
    verificationStatus: "unverified" | "unavailable";
    reason: string | null;
  }>;
}

export type UserRole = "admin" | "user" | "advisor" | "agent";

export type ContactPreference = "email" | "phone" | "app";
export type BestTimeToContact = "morning" | "afternoon" | "evening" | "anytime";
export type LeadRouting = "roundRobin" | "manual";

export type NotificationType = "new_listing" | "price_drop" | "message" | "data_update" | "system";

/** Per notification-type email/in-app("push") delivery toggles, keyed by NotificationType. */
export type NotificationChannels = Record<NotificationType, { email: boolean; push: boolean }>;

export interface UserProfile {
  id: string;
  role: UserRole;
  organizationName: string | null;
  createdAt: string;
  fullName: string | null;
  phone: string | null;
  contactPref: ContactPreference;
  bestTime: BestTimeToContact;
  notificationChannels: NotificationChannels;
  /** Agent-only config — meaningful when role === 'agent'. */
  licenseNumber: string | null;
  leadRouting: LeadRouting;
  notifyNewLead: boolean;
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
  type: NotificationType;
  searchId: string | null;
  propertyId: string | null;
  alertId: string | null;
  conversationId: string | null;
  title: string | null;
  body: string | null;
  linkPath: string | null;
  readAt: string | null;
  createdAt: string;
}

/** A buyer<->professional (agent/advisor) 1:1 chat thread, optionally scoped to a listing. */
export interface Conversation {
  id: string;
  propertyId: string | null;
  advisorId: string;
  userId: string;
  createdAt: string;
  advisorLastReadAt: string | null;
  userLastReadAt: string | null;
}

/** A Conversation joined with the caller's counterpart + property + last-message context, for the inbox list. */
export interface ConversationWithContext extends Conversation {
  counterpartId: string;
  counterpartName: string;
  counterpartRole: UserRole;
  propertyAddress: string | null;
  lastMessage: Message | null;
  unread: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface AppSettings {
  broadcastEnabled: boolean;
  updatedAt: string;
}

export type RecommendationStatus = "pending" | "accepted" | "dismissed";

/** An advisor/agent recommending a listing to a connected client, with the client's response. */
export interface ListingRecommendation {
  id: string;
  batchId: string;
  propertyId: string;
  advisorId: string;
  userId: string;
  message: string | null;
  status: RecommendationStatus;
  responseMessage: string | null;
  createdAt: string;
  respondedAt: string | null;
}

export interface PropertyFilters {
  /** JSON of a simple 3–64 vertex [longitude,latitude] ring. Null removes the drawn-area filter. */
  polygon?: string | null;
  location: string | null;
  postnummer: string | null;
  propertyTypes: PropertyType[] | null;
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
export type { SparHistoryPoint, SparListingEstimate, SparListingStatus } from "./spar.js";

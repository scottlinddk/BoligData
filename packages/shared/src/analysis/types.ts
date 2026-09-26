import type { PropertyType, SaleType } from "../types/index.js";

export type EvidenceStatus = "unknown" | "reported" | "verified" | "conflicting";
export type CriterionStatus = "met" | "failed" | "unknown";
export type ResearchDataMode = "live" | "mock" | "unavailable";
export type ResearchNextAction = "viewing" | "clarify_price" | "clarify_documents" | "rejected";
export type ResearchDate = { value: string; precision: "day" | "month" | "year" };

/** Private project data, never a public search rule or shared with an agent automatically. */
export interface BuyingProject {
  name: string;
  totalBudget: number;
  minResidentialArea: number;
  minBedrooms: number;
  acceptedPropertyTypes: PropertyType[];
  primaryAreas: string[];
  secondaryAreas: string[];
  excludedAddresses: string[];
  excludedRoads: string[];
  excludedAreas: string[];
  preferences: string[];
  tracks: ("move_in_ready" | "renovation")[];
}

export interface ResearchCriterion {
  id: string;
  label: string;
  status: CriterionStatus;
  reason: string;
  hard: boolean;
}

export type BudgetCategory = "transaction" | "necessary_work" | "improvement" | "deferred_work" | "advice" | "relocation" | "finance" | "other" | "reserve";
export interface BudgetItem {
  id: string;
  label: string;
  category: BudgetCategory;
  /** Null is unknown, including for necessary work; explicitly entered zero is known zero. */
  low: number | null;
  high: number | null;
  vat: "included" | "excluded" | "not_applicable" | "unknown";
  /** Explicit fractional rate when VAT is excluded. No implicit universal VAT assumption. */
  vatRate: number | null;
  status: "assumption" | "estimate" | "quote";
  source: string;
  observedAt: string | null;
  necessary: boolean;
  include: boolean;
  /** A reserve already present in an included quote points at that quote, avoiding double count. */
  coveredByItemId: string | null;
}

export interface BudgetScenario {
  /** Sum of known included costs, not necessarily the complete budget. */
  costs: number;
  maxPurchasePrice: number | null;
  projectTotal: number | null;
  headroom: number | null;
  complete: boolean;
}
export interface ProjectBudgetResult {
  base: BudgetScenario;
  stress: BudgetScenario;
  unknownItems: string[];
  warnings: string[];
}

export interface ComparableSelection { transactionId: string; included: boolean; reason: string }
export interface ResearchQuestion { id: string; text: string; resolved: boolean }
export interface ResearchDocument {
  id: string;
  title: string;
  url: string;
  reference: string;
  classification: string;
  source: string;
  observedAt: string | null;
  status: EvidenceStatus;
}
export interface ResearchAssessment {
  propertyId: string;
  legalBedrooms: number | null;
  bedroomEvidence: EvidenceStatus;
  bedroomSource: string;
  residentialArea: number | null;
  areaEvidence: EvidenceStatus;
  areaSource: string;
  hardRequirements: ResearchCriterion[];
  budgetItems: BudgetItem[];
  selectedPurchasePrice: number | null;
  questions: ResearchQuestion[];
  notes: string;
  comparables: ComparableSelection[];
  documents: ResearchDocument[];
  brokerDraft: string;
  budgetScenario: "base" | "stress";
}

export interface ResearchPropertyFacts {
  address: string;
  road?: string | null;
  area?: string | null;
  propertyType: PropertyType | null;
  residentialArea: number | null;
  areaEvidence: EvidenceStatus;
  areaSource?: string;
  /** Basement and advertised rooms intentionally cannot fulfill residential/bedroom requirements. */
  basementArea?: number | null;
  advertisedRooms?: number | null;
  legalBedrooms: number | null;
  bedroomEvidence: EvidenceStatus;
  bedroomSource?: string;
  hardRequirements?: ResearchCriterion[];
  dataMode?: ResearchDataMode;
}
export interface PropertyResearchDecision {
  criteria: ResearchCriterion[];
  suitability: CriterionStatus;
  documentation: CriterionStatus;
  economy: CriterionStatus;
  nextAction: ResearchNextAction;
  reason: string;
}

export interface ResearchPriceInput {
  firstAsking: number | null;
  currentAsking: number | null;
  lastAsking: number | null;
  soldPrice: number | null;
  targetPrice: number | null;
}
/** Percentages are signed percentage points (16.67 means 16.67%). */
export interface ResearchPriceMetrics {
  alreadyReducedPercent: number | null;
  additionalDiscountAmount: number | null;
  additionalDiscountPercent: number | null;
  totalRequiredFallPercent: number | null;
  historicalTotalFallPercent: number | null;
  historicalLastDiscountPercent: number | null;
  noDiscountRequired: boolean;
}

export interface ResearchActiveInterval {
  start: ResearchDate;
  end: ResearchDate | null;
  source: string;
}
export interface ResearchTimeMetrics {
  latestEpisodeDays: number | null;
  latestEpisodeDefinition: string | null;
  activeDays: number | null;
  calendarDays: number | null;
  firstDocumentedListing: ResearchDate | null;
  firstSeenAt: string | null;
  warnings: string[];
}

export type ConditionSignal = "needs_work" | "original_condition" | "weak_potential" | "completed_work" | "move_in_ready" | "demolition" | "estate" | "unknown";
export interface ConditionEvidenceInput {
  text: string | null;
  source: string;
  listingEpisodeId: string | null;
  observedAt: string;
  validAt: string | null;
  saleDate?: string | null;
  humanApproved?: boolean;
}
export interface ResearchConditionEvidence extends ConditionEvidenceInput {
  signals: ConditionSignal[];
  excerpts: { signal: ConditionSignal; text: string }[];
  method: "danish_text_rules";
  methodVersion: string;
  historicalAssociation: "eligible" | "unverified" | "after_sale";
}

export type ResearchTimeDefinition = "active_days" | "latest_episode_days" | "calendar_days";
export interface ResearchTransaction {
  id: string;
  /** Verified transaction identifier shared by duplicate sources. Never an approximate address join. */
  transactionIdentity: string;
  propertyId: string;
  unitId: string | null;
  address: string;
  municipality: string | null;
  postalCode: string | null;
  lat?: number | null;
  lon?: number | null;
  propertyType: PropertyType;
  saleType: SaleType | null;
  saleDate: string | null;
  observedAt: string;
  firstAsking: number | null;
  lastAsking: number | null;
  soldPrice: number | null;
  residentialArea: number | null;
  areaDefinition: "residential" | "weighted" | "unknown";
  areaAtSale: boolean;
  areaEvidence: EvidenceStatus;
  activeDays: number | null;
  latestEpisodeDays: number | null;
  calendarDays: number | null;
  condition: ResearchConditionEvidence | null;
  dataMode: ResearchDataMode;
  status: "sold" | "active" | "withdrawn";
  source: string;
}
export interface ResearchAnalysisFilters {
  propertyTypes?: PropertyType[];
  municipality?: string;
  postalCode?: string;
  street?: string;
  minArea?: number;
  maxArea?: number;
  minSoldPrice?: number;
  maxSoldPrice?: number;
  minFirstAsking?: number;
  maxFirstAsking?: number;
  saleFrom?: string;
  saleTo?: string;
  saleMonth?: number;
  minDays?: number;
  maxDays?: number;
  timeDefinition: ResearchTimeDefinition;
  strictRenovation?: boolean;
  requireVerifiedArea?: boolean;
  estateOnly?: boolean;
  /** Coordinate order is longitude, latitude; missing coordinates fail an active spatial filter. */
  polygon?: [number, number][];
  /** West, south, east, north (longitude/latitude). */
  bbox?: [number, number, number, number];
  includedTransactionIds?: string[];
  excludedTransactionIds?: string[];
  /** Defaults to normal transfers only. Explicitly changing this is recorded in the snapshot. */
  saleTypes?: SaleType[];
  dataVersion: string;
  calculatedAt: string;
}
export interface ResearchDistribution {
  count: number;
  mean: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
  coverage: number;
}
export interface ResearchAnalysisResult {
  transactions: ResearchTransaction[];
  selectedCount: number;
  propertyCount: number;
  totalFall: ResearchDistribution;
  lastDiscount: ResearchDistribution;
  pricePerResidentialSqm: ResearchDistribution;
  groups: { label: string; min: number; max: number | null; transactionIds: string[]; totalFall: ResearchDistribution }[];
  missing: { firstAsking: number; lastAsking: number; area: number; text: number; validDays: number };
  excluded: { transactionId: string; reason: string }[];
  warnings: string[];
  snapshot: { dataVersion: string; methodVersion: string; calculatedAt: string; filters: ResearchAnalysisFilters; transactionIds: string[] };
}

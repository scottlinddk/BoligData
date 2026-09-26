import type { BuyingProject, ResearchAssessment, ResearchTransaction } from "../analysis/types.js";

export type DatePrecision = "day" | "month" | "interval" | "unknown";
export type SourceDataMode = "real" | "mock" | "demo" | "unknown";
export interface ResearchCampaign {
  id: string; propertyId: string; linkReason: string; source: string; sourceUrl: string | null; observedAt: string;
}
export interface ResearchEpisode {
  id: string; propertyId: string; campaignId: string | null; source: string; sourceListingId: string | null;
  sourceUrl: string | null; startDate: string | null; endDate: string | null; datePrecision: DatePrecision;
  status: "active" | "paused" | "removed" | "sold" | "unknown"; agentName: string | null;
  observedAt: string; dataMode: SourceDataMode;
}
export interface ResearchEvent {
  id: string; propertyId: string; campaignId: string | null; episodeId: string | null;
  eventType: "first_listing" | "price_change" | "paused" | "relisted" | "removed" | "sold" | "observation";
  eventDate: string | null; eventDateEnd: string | null; datePrecision: DatePrecision; price: number | null;
  source: string; sourceUrl: string | null; observedAt: string; dataMode: SourceDataMode;
}
export interface ResearchObservation {
  id: string; propertyId: string; fieldName: string; value: unknown; source: string; sourceUrl: string | null;
  effectiveDate: string | null; datePrecision: DatePrecision; observedAt: string; method: string;
  verificationStatus: "unverified" | "verified" | "conflict" | "not_found" | "unavailable";
  dataMode: SourceDataMode; sourceFile: string | null; sourceSheet: string | null; sourceRow: number | null;
  sourceVersion: string | null; conflictGroup: string | null;
}
export interface StoredConditionEvidence {
  id: string; propertyId: string; episodeId: string | null; transactionId: string | null; excerpt: string;
  signals: string[]; source: string; sourceUrl: string | null; effectiveDate: string | null; observedAt: string;
  method: string; methodVersion: string; humanApproved: boolean; dataMode: SourceDataMode;
}
export interface ResearchHistoryResponse {
  campaigns: ResearchCampaign[]; episodes: ResearchEpisode[]; events: ResearchEvent[];
  transactions: (ResearchTransaction & { datePrecision: DatePrecision; saleDateEnd: string | null; sourceUrl: string | null })[];
  observations: ResearchObservation[]; conditionEvidence: StoredConditionEvidence[];
  dataVersion: string; retrievedAt: string;
  /** Pagination is explicit; a bounded response must never look like all market data. */
  truncated: boolean;
}
export interface ResearchProjectResponse { project: BuyingProject | null; updatedAt: string | null }
export interface ResearchAssessmentResponse {
  assessment: ResearchAssessment | null; revision: number | null; updatedAt: string | null;
  revisions: { id: string; revision: number; assessment: ResearchAssessment; projectSnapshot: BuyingProject | null;
    propertySnapshot: { id: string; address: string; price: number; status: string; sqm: number; propertyType: string; updatedAt: string; dataMode: SourceDataMode } | null;
    createdAt: string }[];
}
export interface ResearchAssessmentsResponse {
  assessments: { assessment: ResearchAssessment; revision: number; updatedAt: string; property: { id: string; address: string; price: number; sqm: number; propertyType: string } | null }[];
}
export type ResearchImportField = "propertyId" | "soldDate" | "salePrice" | "saleType" | "firstAskingPrice" | "lastAskingPrice"
  | "residentialArea" | "areaDefinition" | "areaAsOf" | "latestEpisodeDays" | "documentedActiveDays" | "calendarDays"
  | "sourceUrl" | "conditionText" | "conditionAsOf";
export interface ResearchImportRequest {
  csv: string; mapping: Partial<Record<ResearchImportField, string>>; fileName: string; sheetName: string;
  sourceVersion: string; collectedAt: string; delimiter?: "," | ";" | "\t";
  /** Omission means unknown and excludes the import from production references. */
  dataMode?: SourceDataMode;
}
export interface ResearchImportPreviewRow {
  rowNumber: number; status: "accepted" | "rejected" | "duplicate" | "quarantined";
  reasons: string[]; values: Record<string, string>; normalized: Record<string, unknown> | null;
}
export interface ResearchImportPreviewResponse {
  batchId: string; columns: string[]; mapping: Partial<Record<ResearchImportField, string>>;
  counts: { total: number; accepted: number; rejected: number; duplicate: number; quarantined: number };
  rows: ResearchImportPreviewRow[];
  reconciliation: { historicalControl: { rows: 437; pricePairs: 317; pairsWithDays: 281; groups: number[] }; actual: { rows: number; pricePairs: number; pairsWithDays: number; groups: number[] }; note: string };
}

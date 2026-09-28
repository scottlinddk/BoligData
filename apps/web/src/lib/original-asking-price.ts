import { parseResearchDay } from "@shared/analysis";
import type { Property } from "@shared/types/index";
import type { ResearchHistoryResponse, ResearchObservation } from "@shared/types/research-api";

export interface OriginalAskingPriceEvidence {
  price: number;
  episodeId: string;
  source: string;
  sourceListingId: string;
  sourceUrl: string | null;
  observedAt: string;
  originalDate: string | null;
}
export interface OriginalAskingPriceResolution {
  status: "available" | "missing" | "incomplete" | "invalid" | "conflict";
  evidence: OriginalAskingPriceEvidence | null;
}

const empty = (status: OriginalAskingPriceResolution["status"]): OriginalAskingPriceResolution => ({ status, evidence: null });
const timestamp = (value: string): number => /^\d{4}-\d{2}-\d{2}T/.test(value)
  && parseResearchDay(value.slice(0, 10)) !== null ? Date.parse(value) : NaN;

/** An exact source amount is evidence about this listing, not a manufactured
 * first-listing event. Its original date may remain unknown. The dedicated
 * evidence slice can be complete while ordinary history is paginated. */
export function originalAskingPrice(property: Property, history?: ResearchHistoryResponse): OriginalAskingPriceResolution {
  if (!history || property.status !== "active" || ["mock", "demo"].includes(property.dataMode ?? "unknown")
      || property.listingSource !== "boligsiden" || !property.externalId) return empty("missing");
  const dedicated = history.originalAskingEvidence;
  if (dedicated && dedicated.propertyId !== property.id) return empty("invalid");
  const rows = dedicated?.observations ?? history.observations;
  const candidates = rows.filter(row => row.propertyId === property.id && row.fieldName === "original_asking_price"
    && row.source === property.listingSource && row.dataMode === "real");
  if (!(dedicated ? dedicated.complete : !history.truncated)) return empty("incomplete");
  if (candidates.length === 0) return empty("missing");
  const retrieved = timestamp(history.retrievedAt);
  if (!Number.isFinite(retrieved) || retrieved > Date.now()) return empty("invalid");
  const current = history.episodes.filter(row => row.propertyId === property.id && row.source === property.listingSource
    && row.sourceListingId === property.externalId && row.status === "active" && row.dataMode === "real");
  if (current.length !== 1) return empty("invalid");
  const episode = current[0]!;
  const episodeTime = timestamp(episode.observedAt);
  if (!episode.id || episode.endDate !== null || !Number.isFinite(episodeTime) || episodeTime > retrieved) return empty("invalid");
  const start = episode.datePrecision === "day" && episode.startDate !== null ? parseResearchDay(episode.startDate) : null;
  if (episode.datePrecision === "day" && episode.startDate !== null && (start === null || start > episodeTime)) return empty("invalid");
  const matching = candidates.filter(row => row.episodeId === episode.id);
  if (matching.length === 0) return empty("missing");
  const observed = matching.map(row => ({ row, time: timestamp(row.observedAt) }));
  if (observed.some(({ time }) => !Number.isFinite(time) || time > retrieved || (start !== null && time < start))) return empty("invalid");
  const newest = Math.max(...observed.map(item => item.time));
  const latest = observed.filter(item => item.time === newest);
  // A newer invalid/conflicted record supersedes older observations. Never
  // resurrect an old amount by filtering bad newest evidence away first.
  if (observed.some(({ row }) => row.verificationStatus === "conflict" || row.conflictGroup)) return empty("conflict");
  const values = latest.map(({ row }) => exactValue(row, property.externalId));
  if (values.some(value => value === null)) return empty("invalid");
  const price = values[0]!.price;
  // Original prices do not change with later reductions. Differing exact
  // amounts in the same episode require explicit conflict resolution.
  if (observed.some(({ row }) => {
    const value = exactValue(row, property.externalId);
    return value !== null && value.price !== price;
  })) return empty("conflict");
  const originals = values.map(value => value!.originalDate).filter((value): value is string => value !== null);
  if (new Set(originals).size > 1) return empty("conflict");
  const selected = latest[0]!.row;
  return { status: "available", evidence: { price, episodeId: episode.id, source: selected.source, sourceListingId: property.externalId,
    sourceUrl: selected.sourceUrl, observedAt: selected.observedAt, originalDate: originals[0] ?? null } };
}

function exactValue(row: ResearchObservation, sourceListingId: string): { price: number; originalDate: string | null } | null {
  if (row.method !== "source_reported_original_asking" || !["unverified", "verified"].includes(row.verificationStatus)
      || row.conflictGroup || !row.value || typeof row.value !== "object" || Array.isArray(row.value)) return null;
  const { price, sourceListingId: reportedId, scope, originalDate } = row.value as Record<string, unknown>;
  if (reportedId !== sourceListingId || scope !== "listing" || typeof price !== "number" || !Number.isFinite(price) || price <= 0
      || price > 1_000_000_000) return null;
  if (originalDate === null) return row.effectiveDate === null && row.datePrecision === "unknown" ? { price, originalDate } : null;
  if (typeof originalDate !== "string" || parseResearchDay(originalDate) === null || originalDate > row.observedAt.slice(0, 10)
      || row.effectiveDate !== originalDate || row.datePrecision !== "day") return null;
  return { price, originalDate };
}

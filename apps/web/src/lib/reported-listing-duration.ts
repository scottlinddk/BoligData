import { parseResearchDay } from "@shared/analysis";
import type { Property } from "@shared/types/index";
import type { ResearchHistoryResponse } from "@shared/types/research-api";

function observationTime(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || parseResearchDay(value.slice(0, 10)) === null) return null;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? stamp : null;
}

/** A dated source claim only: never a reconstructed start date, active interval,
 * or total campaign duration. The chronology adapter decides whether this dated
 * count can supply its current-listing duration. */
export function reportedListingDuration(property: Property, history?: ResearchHistoryResponse, asOf = new Date().toISOString()): { days: number; observedAt: string } | null {
  const latest = latestReportedDuration(property, history, asOf, value => validDays(value.latestEpisodeDays));
  return latest ? { days: latest.parsed, observedAt: latest.observedAt } : null;
}

export interface ReportedRealtorPeriod {
  realtorId: string;
  realtorName: string | null;
  days: number;
  isCurrent: boolean;
}

/** The source's total marketing period at this address, which can span earlier
 * listings with the same or another broker. It is the source's own count:
 * handover gaps are excluded and broker shares may overlap by a day. */
export interface ReportedMarketingPeriod {
  totalDays: number;
  currentDays: number;
  observedAt: string;
  /** Null when the source did not supply a usable per-broker breakdown. */
  realtors: ReportedRealtorPeriod[] | null;
  /** True/false only when the breakdown proves it; null when earlier periods
   * exist but their broker is unknown. Never inferred from day counts alone. */
  brokerChanged: boolean | null;
}

export function reportedMarketingPeriod(property: Property, history?: ResearchHistoryResponse, asOf = new Date().toISOString()): ReportedMarketingPeriod | null {
  const latest = latestReportedDuration(property, history, asOf, parseMarketingPeriod, (a, b) => JSON.stringify(a) === JSON.stringify(b));
  return latest ? { ...latest.parsed, observedAt: latest.observedAt } : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function validDays(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 36_500 ? value : null;
}

function parseMarketingPeriod(value: Record<string, unknown>): Omit<ReportedMarketingPeriod, "observedAt"> | null {
  const currentDays = validDays(value.latestEpisodeDays);
  const totalDays = validDays(value.totalDays);
  if (currentDays === null || totalDays === null || totalDays < currentDays) return null;
  const currentRealtorId = typeof value.currentRealtorId === "string" && UUID.test(value.currentRealtorId) ? value.currentRealtorId : null;
  const realtors = parseRealtors(value.realtors, totalDays, currentRealtorId);
  const brokerChanged = realtors ? realtors.length > 1 : totalDays === currentDays ? false : null;
  return { totalDays, currentDays, realtors, brokerChanged };
}

/** All-or-nothing, like the crawler: a partial list would hide earlier brokers. */
function parseRealtors(value: unknown, totalDays: number, currentRealtorId: string | null): ReportedRealtorPeriod[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const rows: ReportedRealtorPeriod[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    const days = validDays(row.days);
    if (typeof row.realtorId !== "string" || !UUID.test(row.realtorId) || days === null || days > totalDays) return null;
    if (row.realtorName !== null && row.realtorName !== undefined && typeof row.realtorName !== "string") return null;
    const realtorName = typeof row.realtorName === "string" ? row.realtorName.trim() || null : null;
    rows.push({ realtorId: row.realtorId, realtorName, days, isCurrent: row.realtorId === currentRealtorId });
  }
  if (new Set(rows.map(row => row.realtorId)).size !== rows.length) return null;
  return rows.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.days - a.days);
}

function latestReportedDuration<T>(
  property: Property, history: ResearchHistoryResponse | undefined, asOf: string,
  parse: (value: Record<string, unknown>) => T | null, same: (a: T, b: T) => boolean = Object.is,
): { parsed: T; observedAt: string } | null {
  if (!history || property.dataMode !== "real" || property.status !== "active") return null;
  if (!property.id?.trim() || !property.listingSource?.trim() || !property.externalId?.trim()) return null;
  // A clipped observation list can still contain this dated claim. A clipped
  // episode list cannot establish that the matching current case is unique.
  if (history.truncated && history.episodes.length >= 500) return null;
  const day = parseResearchDay(asOf);
  const cutoff = day === null ? observationTime(asOf) : day + 86_400_000 - 1;
  if (cutoff === null) return null;
  const now = Math.min(cutoff, Date.now());
  const retrieved = observationTime(history.retrievedAt);
  if (retrieved === null || retrieved > now) return null;
  const current = history.episodes.filter(episode => episode.propertyId === property.id && episode.source === property.listingSource &&
    episode.sourceListingId === property.externalId && episode.dataMode === "real" && episode.status === "active");
  if (current.length !== 1) return null;
  const episode = current[0]!;
  const episodeTime = observationTime(episode.observedAt);
  if (!episode.id?.trim() || episode.endDate !== null || episodeTime === null || episodeTime > retrieved) return null;
  const candidates = history.observations.flatMap(observation => {
    if (observation.propertyId !== property.id || observation.episodeId !== episode.id || observation.source !== property.listingSource ||
        observation.dataMode !== "real" || observation.fieldName !== "reported_time_on_market" || observation.method !== "source_reported_duration" ||
        !["unverified", "verified"].includes(observation.verificationStatus) || observation.conflictGroup || observation.datePrecision !== "day") return [];
    const stamp = observationTime(observation.observedAt);
    if (stamp === null || stamp > retrieved || observation.effectiveDate !== observation.observedAt.slice(0, 10)) return [];
    const value = observation.value;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
    const parsed = parse(value as Record<string, unknown>);
    return parsed === null ? [] : [{ parsed, observedAt: observation.observedAt, stamp, id: observation.id }];
  }).sort((a, b) => b.stamp - a.stamp || a.id.localeCompare(b.id));
  const latest = candidates[0];
  if (!latest || candidates.some(candidate => candidate.stamp === latest.stamp && !same(candidate.parsed, latest.parsed))) return null;
  return { parsed: latest.parsed, observedAt: latest.observedAt };
}

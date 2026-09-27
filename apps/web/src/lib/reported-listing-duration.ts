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
    const days = (value as Record<string, unknown>).latestEpisodeDays;
    if (typeof days !== "number" || !Number.isInteger(days) || days < 0 || days > 36_500) return [];
    return [{ days, observedAt: observation.observedAt, stamp, id: observation.id }];
  }).sort((a, b) => b.stamp - a.stamp || a.id.localeCompare(b.id));
  const latest = candidates[0];
  if (!latest || candidates.some(candidate => candidate.stamp === latest.stamp && candidate.days !== latest.days)) return null;
  return { days: latest.days, observedAt: latest.observedAt };
}

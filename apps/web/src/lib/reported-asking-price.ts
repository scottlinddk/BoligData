import { parseResearchDay } from "@shared/analysis";
import type { Property } from "@shared/types/index";
import type { ResearchHistoryResponse } from "@shared/types/research-api";

/** A scenario baseline reconstructed from Boligsiden's rounded asking-price
 * change. This is never a documented first asking price or first-listing date.
 * The card must name the approximation; chronology/valuation must not use it. */
export function reportedAskingPrice(property: Property, history?: ResearchHistoryResponse): {
  firstAsking: number; askingAtObservation: number; changePercent: number; observedAt: string;
} | null {
  if (!history || history.truncated || property.dataMode !== "real" || property.status !== "active" ||
      property.listingSource !== "boligsiden" || !property.externalId) return null;
  const timestamp = (value: string): number | null => {
    if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || parseResearchDay(value.slice(0, 10)) === null) return null;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  };
  const retrieved = timestamp(history.retrievedAt);
  if (retrieved === null || retrieved > Date.now()) return null;
  const current = history.episodes.filter(row => row.propertyId === property.id && row.source === property.listingSource &&
    row.sourceListingId === property.externalId && row.status === "active" && row.dataMode === "real");
  if (current.length !== 1) return null;
  const episode = current[0]!;
  const episodeTime = timestamp(episode.observedAt);
  if (!episode.id || episode.endDate !== null || episodeTime === null || episodeTime > retrieved) return null;
  const start = episode.datePrecision === "day" && episode.startDate !== null ? parseResearchDay(episode.startDate) : null;
  if (episode.datePrecision === "day" && episode.startDate !== null && (start === null || start > episodeTime)) return null;
  // Do not replace conflicting/documented prices with a reconstructed value.
  if (history.events.some(row => row.propertyId === property.id && row.campaignId === episode.campaignId && row.dataMode === "real" &&
    ((row.eventType === "first_listing" && row.price !== null) || ["sold", "relisted"].includes(row.eventType)))) return null;
  // Select the newest observation for this exact identity BEFORE validating
  // its value. A newer conflict/unknown value supersedes the earlier estimate;
  // filtering it away would silently resurrect stale evidence.
  const observations = history.observations.filter(row => row.propertyId === property.id && row.episodeId === episode.id &&
    row.source === "boligsiden" && row.dataMode === "real" && row.fieldName === "asking_price_change")
    .map(row => ({ row, time: timestamp(row.observedAt) }));
  if (observations.length === 0 || observations.some(({ time }) => time === null || time > retrieved || (start !== null && time < start))) return null;
  const newest = Math.max(...observations.map(({ time }) => time!));
  const candidates = [];
  for (const { row } of observations.filter(({ time }) => time === newest)) {
    if (row.method !== "source_reported_price_change" || !["unverified", "verified"].includes(row.verificationStatus) ||
        row.conflictGroup || row.datePrecision !== "day" || row.effectiveDate !== row.observedAt.slice(0, 10)) return null;
    const value = row.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const { currentAsking, changePercent } = value as Record<string, unknown>;
    if (typeof currentAsking !== "number" || !Number.isFinite(currentAsking) || currentAsking <= 0 ||
        typeof changePercent !== "number" || !Number.isFinite(changePercent) || changePercent <= -100) return null;
    candidates.push({ currentAsking, changePercent, observedAt: row.observedAt });
  }
  const latest = candidates[0];
  if (!latest || candidates.some(row =>
      row.currentAsking !== latest.currentAsking || row.changePercent !== latest.changePercent)) return null;
  // Use the asking price and percentage captured together by the source. A
  // later reduction to today's asking does not alter the original price, and
  // combining that newer amount with an older percentage would discount twice.
  const firstAsking = latest.currentAsking / (1 + latest.changePercent / 100);
  if (!Number.isFinite(firstAsking) || firstAsking <= 0 || firstAsking > 1_000_000_000) return null;
  return { firstAsking, askingAtObservation: latest.currentAsking, changePercent: latest.changePercent, observedAt: latest.observedAt };
}

import { calculateWorkbookPriceReference, parseResearchDay } from "@shared/analysis";
import type { Property } from "@shared/types/index";
import type { ResearchHistoryResponse } from "@shared/types/research-api";
import { researchListingTime } from "./research-listing-time";
import { reportedAskingPrice } from "./reported-asking-price";

/** Preserve documented chronology. The calculator may use today's asking price
 * as an explicitly labelled scenario baseline, but never writes it into the
 * first-asking history or invents a listing start from firstSeenAt. */
export function workbookListingReference(property: Property, history?: ResearchHistoryResponse) {
  const listing = researchListingTime(property, history);
  const currentEpisodes = (history?.episodes ?? []).filter(episode =>
    episode.propertyId === property.id && episode.source === property.listingSource &&
    episode.sourceListingId === property.externalId && episode.status === "active" && episode.dataMode === "real");
  const firstEvents = listing.events.filter(event => event.campaignId === listing.campaignId && event.eventType === "first_listing");
  const timestamp = (value: string) => /^\d{4}-\d{2}-\d{2}T/.test(value) && parseResearchDay(value.slice(0, 10)) !== null ? Date.parse(value) : NaN;
  const retrieved = history ? timestamp(history.retrievedAt) : NaN;
  const cutoff = Math.min(retrieved, Date.now());
  const sourceTimes = [
    ...currentEpisodes.map(episode => episode.observedAt),
    ...(history?.campaigns ?? []).filter(campaign => campaign.propertyId === property.id && campaign.id === listing.campaignId).map(campaign => campaign.observedAt),
    ...firstEvents.map(event => event.observedAt),
  ];
  // The chronology adapter works in calendar days. This price card additionally
  // checks instants so a later observation on the same day cannot leak in.
  const invalidSourceTiming = !!history && (!Number.isFinite(retrieved) || retrieved > Date.now() ||
    sourceTimes.some(value => !Number.isFinite(timestamp(value)) || timestamp(value) > cutoff));
  // A source percentage can supply an approximate baseline only when there is
  // no conflicting documented first-price evidence in the current campaign.
  const hasFirstPriceEvidence = firstEvents.some(event => event.price !== null);
  const estimatedFirst = !invalidSourceTiming && listing.firstAsking === null && listing.campaignId !== null && !history?.truncated && !hasFirstPriceEvidence
    ? reportedAskingPrice(property, history) : null;
  const firstAsking = invalidSourceTiming ? null : listing.firstAsking ?? estimatedFirst?.firstAsking ?? null;
  const reference = calculateWorkbookPriceReference({
    firstAsking,
    currentAsking: property.price,
    latestEpisodeDays: invalidSourceTiming ? null : listing.time.latestEpisodeDays,
    propertyType: property.propertyType,
    postalCode: property.postalCode,
  });
  const candidate = property.dataMode === "real" && property.status === "active" && currentEpisodes.length === 1 ? currentEpisodes[0]!.observedAt : null;
  const stamp = candidate ? timestamp(candidate) : NaN;
  const lastSourceCheck = !invalidSourceTiming && candidate && Number.isFinite(stamp) && stamp <= cutoff ? candidate : null;
  return {
    listing, reference, firstAsking, estimatedFirst, lastSourceCheck, invalidSourceTiming,
    stale: lastSourceCheck !== null && Date.now() - Date.parse(lastSourceCheck) > 8 * 86_400_000,
  };
}

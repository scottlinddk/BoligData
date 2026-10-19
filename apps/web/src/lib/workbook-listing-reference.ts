import { calculateWorkbookPriceReference, parseResearchDay } from "@shared/analysis";
import type { Property } from "@shared/types/index";
import type { ResearchHistoryResponse } from "@shared/types/research-api";
import { researchListingTime } from "./research-listing-time";
import { reportedAskingPrice } from "./reported-asking-price";
import { originalAskingPrice } from "./original-asking-price";
import { reportedMarketingPeriod } from "./reported-listing-duration";

/** The reference is anchored to the original asking price. A complete source
 * price/percentage pair may reconstruct it, but today's asking price is only
 * used to show the gap and never substitutes for missing original evidence. */
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
  const exactResolution = originalAskingPrice(property, history);
  const exactOriginal = exactResolution.evidence;
  // A campaign can span several listings. Its earlier first asking is a
  // different scope from the source's original for the current episode.
  const comparableOriginalEvents = exactOriginal ? listing.events.filter(event => event.eventType === "first_listing"
    && event.episodeId === exactOriginal.episodeId && Number.isFinite(timestamp(event.observedAt))
    && timestamp(event.observedAt) <= cutoff && event.price !== null && Number.isFinite(event.price) && event.price > 0
    && (event.eventDate === null ? event.datePrecision === "unknown" : event.datePrecision === "day"
      && parseResearchDay(event.eventDate) !== null && event.eventDate <= event.observedAt.slice(0, 10))
    && (exactOriginal.originalDate === null || event.eventDate === null || event.eventDate === exactOriginal.originalDate)) : [];
  const exactConflict = exactResolution.status === "conflict" || comparableOriginalEvents.some(event => event.price !== exactOriginal!.price);
  const exactBlocked = exactConflict || ["invalid", "incomplete"].includes(exactResolution.status);
  // A source percentage can supply an approximate baseline only when there is
  // no conflicting documented first-price evidence in the current campaign.
  const hasFirstPriceEvidence = firstEvents.some(event => event.price !== null);
  const estimatedFirst = !exactOriginal && !exactBlocked && !invalidSourceTiming && listing.firstAsking === null && listing.campaignId !== null && !history?.truncated && !hasFirstPriceEvidence
    ? reportedAskingPrice(property, history) : null;
  const firstAsking = exactBlocked ? null : exactOriginal?.price ?? (invalidSourceTiming ? null : listing.firstAsking ?? estimatedFirst?.firstAsking ?? null);
  // Match the time to the price basis: an original from the total marketing
  // period (across earlier listings and brokers) pairs with the source's total
  // days; an original from the current listing keeps the current listing's days.
  const marketingPeriod = reportedMarketingPeriod(property, history);
  const timeScope: "total_marketing_period" | "current_listing" = !exactBlocked && exactOriginal?.priceScope === "total_marketing_period" && marketingPeriod !== null
    ? "total_marketing_period" : "current_listing";
  const referenceDays = invalidSourceTiming ? null : timeScope === "total_marketing_period" ? marketingPeriod!.totalDays : listing.time.latestEpisodeDays;
  const reference = calculateWorkbookPriceReference({
    firstAsking,
    currentAsking: property.price,
    latestEpisodeDays: referenceDays,
    propertyType: property.propertyType,
    postalCode: property.postalCode,
  });
  const candidate = property.dataMode === "real" && property.status === "active" && currentEpisodes.length === 1 ? currentEpisodes[0]!.observedAt : null;
  const stamp = candidate ? timestamp(candidate) : NaN;
  const lastSourceCheck = !invalidSourceTiming && candidate && Number.isFinite(stamp) && stamp <= cutoff ? candidate : null;
  return {
    listing, reference, timeScope, marketingPeriod, firstAsking, estimatedFirst, exactOriginal: exactBlocked ? null : exactOriginal,
    originalPriceConflict: exactConflict, originalPriceEvidenceStatus: exactResolution.status, lastSourceCheck, invalidSourceTiming,
    stale: lastSourceCheck !== null && Date.now() - Date.parse(lastSourceCheck) > 8 * 86_400_000,
  };
}

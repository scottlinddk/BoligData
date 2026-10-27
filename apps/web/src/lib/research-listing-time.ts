import { calculateResearchTimeMetrics, type ResearchTimeMetrics } from "@shared/analysis";
import type { Property } from "@shared/types/index";
import type { ResearchEvent, ResearchHistoryResponse } from "@shared/types/research-api";

export interface ResearchListingTimeResult {
  time: ResearchTimeMetrics;
  firstAsking: number | null;
  events: ResearchEvent[];
  campaignId: string | null;
  warnings: string[];
  latestEpisodeSource?: { kind: "source_reported"; source: string; observedAt: string } | null;
}

/**
 * Listing duration and first asking price are not collected: no licensed listing feed is connected, and the
 * app no longer scrapes portals. Every duration is therefore unavailable rather than guessed.
 */
export function researchListingTime(_property: Property, _history?: ResearchHistoryResponse): ResearchListingTimeResult {
  return {
    time: calculateResearchTimeMetrics({
      intervals: [], asOf: new Date().toISOString().slice(0, 10), latestEpisodeDays: null, latestEpisodeDefinition: null,
      firstDocumentedListing: null, firstSeenAt: null,
    }),
    firstAsking: null, events: [], campaignId: null, warnings: [], latestEpisodeSource: null,
  };
}

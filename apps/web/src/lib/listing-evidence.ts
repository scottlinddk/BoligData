import { parseResearchDay } from "@shared/analysis";
import type { Property } from "@shared/types/index";
import type { ResearchHistoryResponse } from "@shared/types/research-api";
import type { MergedPropertyFacts } from "./property-facts";
import type { ResearchListingTimeResult } from "./research-listing-time";
import { reportedListingDuration } from "./reported-listing-duration";
export { reportedListingDuration, reportedMarketingPeriod, type ReportedMarketingPeriod } from "./reported-listing-duration";

const positive = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

/** Report advertised fields separately from verified chronology and registered sales.
 * An advertised date can inform the reader without becoming valuation evidence. */
export function listingEvidence(property: Property, listing: ResearchListingTimeResult, facts?: MergedPropertyFacts, asOf = new Date().toISOString().slice(0, 10), history?: ResearchHistoryResponse) {
  const asking = positive(property.price) ? property.price : null;
  const area = positive(property.sqm) ? property.sqm : null;
  const date = property.listingDate ? parseResearchDay(property.listingDate) : null;
  const now = parseResearchDay(asOf);
  const synthetic = property.dataMode === "demo" || property.dataMode === "mock";
  const reportedDays = !synthetic && date !== null && now !== null && date <= now ? Math.floor((now - date) / 86_400_000) : null;
  const days = listing.time.latestEpisodeDays ?? reportedDays;
  const lastSale = (facts?.priceHistorySource ? facts.priceHistory : []).filter(sale => {
    const sold = parseResearchDay(sale.soldDate);
    return positive(sale.price) && sold !== null && now !== null && sold <= now;
  }).sort((a, b) => b.soldDate.localeCompare(a.soldDate))[0] ?? null;
  const firstAsking = positive(listing.firstAsking) ? listing.firstAsking : null;
  return {
    asking, area, synthetic, pricePerSqm: asking !== null && area !== null ? Math.round(asking / area) : null,
    days, documentedDays: listing.time.latestEpisodeDays !== null && listing.latestEpisodeSource?.kind !== "source_reported",
    reportedTime: reportedListingDuration(property, history, asOf),
    lastSale, firstAsking,
    priceChange: asking !== null && firstAsking !== null ? asking - firstAsking : null,
    rooms: positive(property.rooms) ? property.rooms : null,
    registerArea: positive(facts?.registerAreaSqm) ? facts.registerAreaSqm : null,
  };
}

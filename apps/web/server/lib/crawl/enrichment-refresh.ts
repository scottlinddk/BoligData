import { mockModeEnabled } from "../enrichment-sources/types.js";
import type { RawListing } from "./types.js";

const REGISTER_FLAGS = { bbr: "BBR_MOCK_MODE", valuation: "EJENDOMSVURDERING_MOCK_MODE", soil_type: "GEUS_MOCK_MODE", soil_contamination: "MILJOEPORTALEN_MOCK_MODE", noise: "STOEJKORT_MOCK_MODE" };
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** Price stability is not register freshness. Only current source observations
 * may replace legacy/mocked facts; this never promotes an old row to real. */
export function enrichmentNeedsRefresh(row: Record<string, unknown> | undefined, listing: RawListing, now: string): boolean {
  if (!row || typeof row.source_status !== "object" || row.source_status === null) return true;
  const sources = row.source_status as Record<string, { dataMode?: unknown; observedAt?: unknown }>;
  const expectedSalesMode = listing.data_mode === "real" ? "real" : listing.data_mode === "mock" || listing.data_mode === "demo" ? "mock" : "unavailable";
  if (sources.sales?.dataMode !== expectedSalesMode) return true;
  const mockRun = mockModeEnabled("ENRICH_MOCK_MODE") || listing.data_mode === "mock" || listing.data_mode === "demo";
  for (const [source, flag] of Object.entries(REGISTER_FLAGS)) {
    const status = sources[source];
    const expectsMock = mockRun || mockModeEnabled(flag);
    if (expectsMock) { if (status?.dataMode !== "mock") return true; }
    else if (status?.dataMode !== "real") return true;
  }
  const enrichedAt = typeof row.enriched_at === "string" ? Date.parse(row.enriched_at) : NaN;
  return !Number.isFinite(enrichedAt) || Date.parse(now) - enrichedAt >= REFRESH_AFTER_MS;
}

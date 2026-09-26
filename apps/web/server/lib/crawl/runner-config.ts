import { envInt } from "./http.js";
import { getZipRanges } from "./map-utils.js";
import { mockModeEnabled } from "../enrichment-sources/types.js";

const CAP_DEFAULTS = {
  CRAWL_PAGE_SIZE: [100, 1, 500],
  CRAWL_MAX_PAGES: [10, 1, 100],
  CRAWL_MAX_LISTINGS: [1000, 1, 50_000],
  CRAWL_DELAY_MS: [250, 0, 10_000],
  CRAWL_CONCURRENCY: [8, 1, 20],
} as const;

/** Only this manual runner changes these two limits. Source, ZIP, page size,
 * delay and concurrency remain the deployment's settings. ZIP defaults are
 * already restricted to 9000–9900 when no explicit scope is configured. */
export function configureRunner(fullScan: boolean) {
  const configuredCaps = Object.fromEntries(Object.keys(CAP_DEFAULTS).map((name) => {
    const raw = process.env[name]?.trim();
    // Numeric values are useful diagnostics; arbitrary environment text is not.
    const numeric = raw && Number.isFinite(Number(raw)) ? Number(raw) : null;
    return [name, { present: raw !== undefined, numeric }];
  }));
  if (fullScan) {
    process.env.CRAWL_MAX_PAGES = "100";
    process.env.CRAWL_MAX_LISTINGS = "5000";
  }
  const effectiveCaps = Object.fromEntries(Object.entries(CAP_DEFAULTS).map(([name, [fallback, min, max]]) =>
    [name, envInt(name, fallback, min, max)],
  ));
  const flags = ["CRAWL_MOCK_MODE", "ENRICH_MOCK_MODE", "ADDRESS_LOOKUP_MOCK_MODE", "BBR_MOCK_MODE",
    "EJENDOMSVURDERING_MOCK_MODE", "GEUS_MOCK_MODE", "MILJOEPORTALEN_MOCK_MODE", "MATRIKEL_MOCK_MODE", "STOEJKORT_MOCK_MODE"];
  return {
    fullScan, configuredCaps, effectiveCaps,
    maximumRecordsPerSource: Math.min(effectiveCaps.CRAWL_MAX_LISTINGS!, effectiveCaps.CRAWL_PAGE_SIZE! * effectiveCaps.CRAWL_MAX_PAGES!),
    zipRanges: getZipRanges(),
    explicitZipScope: Boolean(process.env.CRAWL_ZIP_RANGES || process.env.CRAWL_ZIP_MIN || process.env.CRAWL_ZIP_MAX),
    mockFlags: Object.fromEntries(flags.map((flag) => [flag, mockModeEnabled(flag)])),
    configured: Object.fromEntries(["SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DATAFORDELER_API_KEY", "STOEJKORT_TYPENAME"]
      .map((name) => [name, Boolean(process.env[name]?.trim())])),
  };
}

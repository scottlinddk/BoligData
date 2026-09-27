import { envInt } from "./http.js";
import { getZipRanges } from "./map-utils.js";
import { mockModeEnabled } from "../enrichment-sources/types.js";
import type { IngestResult } from "./ingest.js";

const CAP_DEFAULTS = {
  CRAWL_PAGE_SIZE: [100, 1, 500],
  CRAWL_MAX_PAGES: [10, 1, 1000],
  CRAWL_MAX_LISTINGS: [1000, 1, 50_000],
  CRAWL_DELAY_MS: [250, 0, 10_000],
  CRAWL_CONCURRENCY: [8, 1, 20],
} as const;

const CONFIGURATION_NAMES = ["SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DATAFORDELER_API_KEY", "STOEJKORT_TYPENAME"];
const MOCK_FLAGS = ["CRAWL_MOCK_MODE", "ENRICH_MOCK_MODE", "ADDRESS_LOOKUP_MOCK_MODE", "BBR_MOCK_MODE",
  "EJENDOMSVURDERING_MOCK_MODE", "GEUS_MOCK_MODE", "MILJOEPORTALEN_MOCK_MODE", "MATRIKEL_MOCK_MODE", "STOEJKORT_MOCK_MODE", "BOLIGSIDEN_SALES_MOCK_MODE"];

/** Vercel intentionally redacts sensitive production variables in `pull`.
 * These markers are not credentials and must never be sent to a service. */
export function isSensitivePlaceholder(value: string | undefined): boolean {
  return value?.trim() === "[SENSITIVE]";
}

export function assertRunnerDatabaseConfiguration(): void {
  const urlName = process.env.SUPABASE_URL === undefined ? "VITE_SUPABASE_URL" : "SUPABASE_URL";
  const unavailable = [urlName, "SUPABASE_SERVICE_ROLE_KEY"].filter((name) => isSensitivePlaceholder(process.env[name]));
  if (unavailable.length > 0) {
    throw new Error(`Runner cannot access ${unavailable.join(", ")}: Vercel pull replaces sensitive production variables with placeholders. Configure authorized runner credentials separately; no database request was made.`);
  }
}

/** Weekly runs always observe live Boligsiden data. ZIP scope, page size,
 * delay and concurrency remain the deployment's settings. A bounded scan
 * is only successful when the requested feed was actually exhausted. */
export function configureRunner(fullScan: boolean, weekly = false) {
  const configuredCaps = Object.fromEntries(Object.keys(CAP_DEFAULTS).map((name) => {
    const raw = process.env[name]?.trim();
    // Numeric values are useful diagnostics; arbitrary environment text is not.
    const numeric = raw && Number.isFinite(Number(raw)) ? Number(raw) : null;
    return [name, { present: raw !== undefined, numeric }];
  }));
  if (weekly) {
    process.env.CRAWL_SOURCES = "boligsiden";
    for (const flag of MOCK_FLAGS) process.env[flag] = "false";
    process.env.CRAWL_MAX_PAGES = "1000";
    process.env.CRAWL_MAX_LISTINGS = "50000";
  } else if (fullScan) {
    process.env.CRAWL_MAX_PAGES = "100";
    process.env.CRAWL_MAX_LISTINGS = "5000";
  }
  const effectiveCaps = Object.fromEntries(Object.entries(CAP_DEFAULTS).map(([name, [fallback, min, max]]) =>
    [name, envInt(name, fallback, min, max)],
  ));
  return {
    fullScan: fullScan || weekly, weekly, configuredCaps, effectiveCaps,
    maximumRecordsPerSource: Math.min(effectiveCaps.CRAWL_MAX_LISTINGS!, effectiveCaps.CRAWL_PAGE_SIZE! * effectiveCaps.CRAWL_MAX_PAGES!),
    zipRanges: getZipRanges(),
    explicitZipScope: Boolean(process.env.CRAWL_ZIP_RANGES || process.env.CRAWL_ZIP_MIN || process.env.CRAWL_ZIP_MAX),
    mockFlags: Object.fromEntries(MOCK_FLAGS.map((flag) => [flag, mockModeEnabled(flag)])),
    configured: Object.fromEntries(CONFIGURATION_NAMES
      .map((name) => [name, Boolean(process.env[name]?.trim()) && !isSensitivePlaceholder(process.env[name])])),
    sensitivePlaceholders: Object.fromEntries(CONFIGURATION_NAMES.map((name) => [name, isSensitivePlaceholder(process.env[name])])),
  };
}

/** Source caps and mapping exclusions can leave ingestion successful but
 * coverage incomplete. A full refresh must make that distinction visible. */
export function runnerOutcome(result: IngestResult, requireComplete: boolean) {
  const incompleteSources = result.reports.filter((report) => !report.complete || report.dataMode !== "real")
    .map((report) => report.source);
  const complete = result.reports.length > 0 && incompleteSources.length === 0;
  return {
    ok: result.ok && result.reports.length > 0 && (!requireComplete || complete),
    complete,
    incompleteSources,
  };
}

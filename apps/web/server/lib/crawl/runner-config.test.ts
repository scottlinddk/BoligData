import { afterEach, describe, expect, it, vi } from "vitest";
import { assertRunnerDatabaseConfiguration, configureRunner, runnerOutcome } from "./runner-config.js";
import type { IngestSourceReport } from "./ingest.js";

afterEach(() => vi.unstubAllEnvs());
describe("manual runner configuration", () => {
  it("raises only the two bounded coverage limits and keeps scope and pacing", () => {
    vi.stubEnv("CRAWL_MAX_PAGES", "6");
    vi.stubEnv("CRAWL_MAX_LISTINGS", "600");
    vi.stubEnv("CRAWL_PAGE_SIZE", "100");
    vi.stubEnv("CRAWL_DELAY_MS", "750");
    vi.stubEnv("CRAWL_ZIP_RANGES", "9000-9299");
    vi.stubEnv("CRAWL_SOURCES", "boligsiden");
    const result = configureRunner(true);
    expect(result.configuredCaps.CRAWL_MAX_LISTINGS?.numeric).toBe(600);
    expect(result.effectiveCaps).toMatchObject({ CRAWL_MAX_PAGES: 100, CRAWL_MAX_LISTINGS: 5000, CRAWL_PAGE_SIZE: 100, CRAWL_DELAY_MS: 750 });
    expect(result.maximumRecordsPerSource).toBe(5000);
    expect(result.zipRanges).toEqual([{ min: 9000, max: 9299 }]);
    expect(process.env.CRAWL_SOURCES).toBe("boligsiden");
  });
  it("does not change ordinary caps and never reports environment values as credentials", () => {
    vi.stubEnv("CRAWL_MAX_PAGES", "7");
    vi.stubEnv("CRAWL_MAX_LISTINGS", "not-a-number-sensitive-value");
    vi.stubEnv("DATAFORDELER_API_KEY", "private-test-credential");
    vi.stubEnv("ENRICH_MOCK_MODE", "true");
    const result = configureRunner(false);
    expect(result.effectiveCaps.CRAWL_MAX_PAGES).toBe(7);
    expect(result.effectiveCaps.CRAWL_MAX_LISTINGS).toBe(1000);
    expect(result.mockFlags.ENRICH_MOCK_MODE).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private-test-credential");
    expect(JSON.stringify(result)).not.toContain("not-a-number-sensitive-value");
  });
  it("identifies pulled sensitive placeholders and fails before creating a database client", () => {
    vi.stubEnv("SUPABASE_URL", "[SENSITIVE]");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "[SENSITIVE]");
    vi.stubEnv("DATAFORDELER_API_KEY", "[SENSITIVE]");
    const result = configureRunner(false);
    expect(result.configured.SUPABASE_URL).toBe(false);
    expect(result.configured.DATAFORDELER_API_KEY).toBe(false);
    expect(result.sensitivePlaceholders.SUPABASE_SERVICE_ROLE_KEY).toBe(true);
    expect(() => assertRunnerDatabaseConfiguration()).toThrow("Vercel pull replaces sensitive production variables");
  });
  it("checks the effective database URL and does not print supplied credential values", () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_URL", "[SENSITIVE]");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "private-test-key");
    expect(() => assertRunnerDatabaseConfiguration()).not.toThrow();
    expect(JSON.stringify(configureRunner(false))).not.toContain("private-test-key");
    vi.stubEnv("SUPABASE_URL", undefined);
    expect(() => assertRunnerDatabaseConfiguration()).toThrow("VITE_SUPABASE_URL");
  });
});

describe("weekly runner", () => {
  it("selects live Boligsiden, removes mock modes, and keeps the configured region and pacing", () => {
    for (const name of Object.keys(configureRunner(false).mockFlags)) vi.stubEnv(name, "true");
    vi.stubEnv("CRAWL_SOURCES", "boliga");
    vi.stubEnv("CRAWL_MAX_PAGES", "3");
    vi.stubEnv("CRAWL_MAX_LISTINGS", "300");
    vi.stubEnv("CRAWL_PAGE_SIZE", "100");
    vi.stubEnv("CRAWL_DELAY_MS", "750");
    vi.stubEnv("CRAWL_CONCURRENCY", "4");
    vi.stubEnv("CRAWL_ZIP_RANGES", "9000-9900,6000-6100");
    const result = configureRunner(false, true);
    expect(process.env.CRAWL_SOURCES).toBe("boligsiden");
    expect(result).toMatchObject({ weekly: true, fullScan: true, maximumRecordsPerSource: 50_000 });
    expect(result.effectiveCaps).toMatchObject({ CRAWL_MAX_PAGES: 1000, CRAWL_MAX_LISTINGS: 50_000,
      CRAWL_PAGE_SIZE: 100, CRAWL_DELAY_MS: 750, CRAWL_CONCURRENCY: 4 });
    expect(Object.values(result.mockFlags).every((value) => value === false)).toBe(true);
    expect(result.zipRanges).toEqual([{ min: 9000, max: 9900 }, { min: 6000, max: 6100 }]);
  });

  const sourceReport = (overrides: Partial<IngestSourceReport> = {}): IngestSourceReport => ({
    source: "boligsiden", ok: true, complete: true, dataMode: "real", quarantinedSales: 0,
    fetched: 100, upserted: 100, created: 0, skippedInvalid: 0, skippedOutOfArea: 0, enriched: 0,
    enrichSkippedUnchanged: 100, cadastralLookupFailed: 0, matrikelLookupFailed: 0,
    dbErrors: 0, errors: [], mappingWarnings: [], durationMs: 100, ...overrides,
  });

  it("fails a capped scan or excluded records even when saved observations are valid", () => {
    const result = { ok: true, reports: [sourceReport({ complete: false })] };
    expect(runnerOutcome(result, true)).toEqual({ ok: false, complete: false, incompleteSources: ["boligsiden"] });
    // A deliberately bounded routine refresh remains allowed to process a subset.
    expect(runnerOutcome(result, false).ok).toBe(true);
  });

  it("requires real, complete, successful data and never treats an empty report as success", () => {
    expect(runnerOutcome({ ok: true, reports: [sourceReport()] }, true).ok).toBe(true);
    expect(runnerOutcome({ ok: true, reports: [sourceReport({ dataMode: "mock" })] }, true).ok).toBe(false);
    expect(runnerOutcome({ ok: false, reports: [sourceReport({ dbErrors: 1 })] }, true).ok).toBe(false);
    expect(runnerOutcome({ ok: true, reports: [] }, true).ok).toBe(false);
  });
});

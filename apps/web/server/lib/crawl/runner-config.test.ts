import { afterEach, describe, expect, it, vi } from "vitest";
import { configureRunner } from "./runner-config.js";

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
});

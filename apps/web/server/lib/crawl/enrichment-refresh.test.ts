import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawListing } from "./types.js";
import { enrichmentNeedsRefresh } from "./enrichment-refresh.js";

const listing = { data_mode: "real" } as RawListing;
const now = "2026-09-26T12:00:00Z";
const healthy = () => ({ enriched_at: now, source_status: Object.fromEntries(["sales", "bbr", "valuation", "soil_type", "soil_contamination", "noise"].map((source) => [source, { dataMode: "real", observedAt: now }])) });
beforeEach(() => { for (const flag of ["ENRICH_MOCK_MODE", "BBR_MOCK_MODE", "EJENDOMSVURDERING_MOCK_MODE", "GEUS_MOCK_MODE", "MILJOEPORTALEN_MOCK_MODE", "STOEJKORT_MOCK_MODE"]) vi.stubEnv(flag, undefined); });
afterEach(() => vi.unstubAllEnvs());

describe("refresh unchanged listing enrichment", () => {
  it("reobserves legacy facts instead of marking their unknown provenance real", () => {
    const legacy = { enriched_at: now, source_status: {} };
    expect(enrichmentNeedsRefresh(legacy, listing, now)).toBe(true);
    expect(legacy.source_status).toEqual({});
    expect(enrichmentNeedsRefresh(undefined, listing, now)).toBe(true);
  });
  it("retries unavailable or formerly mocked sources even without a price change", () => {
    const failed = healthy(); failed.source_status.bbr = { dataMode: "unavailable", observedAt: now };
    expect(enrichmentNeedsRefresh(failed, listing, now)).toBe(true);
    const mocked = healthy(); mocked.source_status.bbr = { dataMode: "mock", observedAt: now };
    expect(enrichmentNeedsRefresh(mocked, listing, now)).toBe(true);
  });
  it("keeps fresh live data and respects explicitly configured mocks", () => {
    expect(enrichmentNeedsRefresh(healthy(), listing, now)).toBe(false);
    vi.stubEnv("BBR_MOCK_MODE", "true");
    const configured = healthy(); configured.source_status.bbr = { dataMode: "mock", observedAt: now };
    expect(enrichmentNeedsRefresh(configured, listing, now)).toBe(false);
  });
  it("refreshes stale or undated register snapshots independently of listing content", () => {
    expect(enrichmentNeedsRefresh({ ...healthy(), enriched_at: "2026-09-18T12:00:00Z" }, listing, now)).toBe(true);
    expect(enrichmentNeedsRefresh({ ...healthy(), enriched_at: null }, listing, now)).toBe(true);
  });
});

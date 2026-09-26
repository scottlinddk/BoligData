import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrichProperty } from "./enrich.js";
import { lookupBbr } from "../enrichment-sources/bbr.js";
import { lookupEjendomsvurdering } from "../enrichment-sources/ejendomsvurdering.js";
import { lookupNoiseExposure } from "../enrichment-sources/stoejkort.js";
import type { RawListing } from "./types.js";

vi.mock("../enrichment-sources/bbr.js", () => ({ lookupBbr: vi.fn() }));
vi.mock("../enrichment-sources/ejendomsvurdering.js", () => ({ lookupEjendomsvurdering: vi.fn() }));
vi.mock("../enrichment-sources/stoejkort.js", () => ({ lookupNoiseExposure: vi.fn() }));
vi.mock("../enrichment-sources/geus-jordart.js", () => ({ lookupSoilType: vi.fn().mockResolvedValue({ ok: false, error: "source unavailable" }) }));
vi.mock("../enrichment-sources/miljoeportalen-v1v2.js", () => ({ lookupSoilContamination: vi.fn().mockResolvedValue({ ok: false, error: "source unavailable" }) }));

const listing: RawListing = {
  address: "Testvej 1", municipality: "Aalborg", postal_code: "9000", price: 2_000_000,
  sqm: 116, listing_date: null, listing_source: "boligsiden", external_id: "test-1",
  lat: 57.05, lon: 9.92, status: "active", building_year: 1960, property_type: "villa",
  rooms: 4, images: [], description: null, agent_name: null, listing_url: null,
  sold_price_history: [], data_mode: "real",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ENRICH_MOCK_MODE", "false");
  vi.stubEnv("BBR_MOCK_MODE", "false");
  vi.stubEnv("EJENDOMSVURDERING_MOCK_MODE", "false");
  vi.stubEnv("STOEJKORT_MOCK_MODE", "false");
  vi.mocked(lookupBbr).mockResolvedValue({ ok: false, error: "missing credential" });
  vi.mocked(lookupEjendomsvurdering).mockResolvedValue({ ok: false, error: "missing credential" });
  vi.mocked(lookupNoiseExposure).mockResolvedValue({ ok: false, error: "not configured" });
});
afterEach(() => vi.unstubAllEnvs());

describe("register provenance in crawl enrichment", () => {
  it("keeps unavailable register facts unknown and avoids fabricated metrics", async () => {
    const result = await enrichProperty(listing);
    expect(Object.values(result.bbr_data).every((value) => value === null)).toBe(true);
    expect(result.public_valuation).toBeNull();
    expect(result.risk_flags.noiseExposureLden).toBeNull();
    expect(result.risk_flags.soilContamination.classification).toBe("unknown");
    expect(result.calculated_metrics.daysOnMarket).toBeNull();
    expect(result.calculated_metrics.neighborhoodPricePerSqm).toBeNull();
    expect(result.source_status.bbr).toMatchObject({ dataMode: "unavailable", verificationStatus: "unavailable", reason: "missing credential" });
  });

  it("omits synthetic register data even when a different register is live", async () => {
    vi.stubEnv("BBR_MOCK_MODE", "true");
    vi.mocked(lookupEjendomsvurdering).mockResolvedValue({ ok: true, data: { assessedPropertyValueDkk: 2_000_000, assessedLandValueDkk: 500_000, valuationYear: 2024 } });
    const result = await enrichProperty(listing);
    expect(result.source).toBe("datafordeler");
    expect(result.source_status.bbr?.dataMode).toBe("mock");
    expect(result.source_status.valuation?.dataMode).toBe("real");
    expect(result.bbr_data.areaSqm).toBeNull();
    expect(result.bbr_data.renovationYear).toBeNull();
    expect(result.bbr_data.energyLabel).toBeNull();
    expect(lookupBbr).not.toHaveBeenCalled();
  });

  it("does not call registers or expose synthetic measurements for demo listings", async () => {
    const result = await enrichProperty({ ...listing, data_mode: "mock" });
    expect(Object.values(result.source_status).every((status) => status.dataMode === "mock")).toBe(true);
    expect(result.risk_flags.noiseExposureLden).toBeNull();
    expect(lookupBbr).not.toHaveBeenCalled();
    expect(lookupEjendomsvurdering).not.toHaveBeenCalled();
  });

  it("preserves advisory risk checks without calling a heuristic verified BBR", async () => {
    const result = await enrichProperty(listing);
    expect(result.risk_flags.oilTankRisk).toBe(true);
    expect(result.risk_flags.oilTankRiskSource).toBe("heuristic");
    expect(result.risk_flags.encumbranceCheckRequired).toBe(true);
    expect(result.risk_flags.sewerSeparationCheckRequired).toBe(true);
  });

  it("isolates thrown upstream failures and keeps future registrations out of sale history", async () => {
    vi.mocked(lookupBbr).mockRejectedValue(new Error("upstream down"));
    const result = await enrichProperty({ ...listing, sold_price_history: [{ soldDate: "2999-01-01", price: 3_000_000, pricePerSqm: null }] });
    expect(result.source_status.bbr?.dataMode).toBe("unavailable");
    expect(result.sold_price_history).toEqual([]);
  });
});

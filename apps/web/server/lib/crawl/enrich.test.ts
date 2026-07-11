import { describe, expect, it } from "vitest";
import { enrichProperty } from "./enrich.js";
import type { RawListing } from "./types.js";

const listing: RawListing = {
  address: "Testvej 1",
  municipality: "Aalborg",
  postal_code: "9000",
  price: 2000000,
  sqm: 100,
  listing_date: "2026-01-01",
  listing_source: "boligsiden",
  external_id: "bs-test-1",
  lat: 57.05,
  lon: 9.92,
  status: "active",
  building_year: 1960,
  property_type: "villa",
  rooms: 4,
  images: [],
  description: null,
  agent_name: null,
};

describe("enrichProperty (mock mode)", () => {
  it("derives a deterministic price-per-sqm and flags a pre-1970 oil tank risk", async () => {
    const result = await enrichProperty(listing);
    expect(result.calculated_metrics.pricePerSqm).toBe(20000);
    expect(result.risk_flags.oilTankRisk).toBe(true);
    expect(result.source).toBe("mock");
  });

  it("is deterministic across repeated calls for the same external_id", async () => {
    const first = await enrichProperty(listing);
    const second = await enrichProperty(listing);
    expect(first.risk_flags).toEqual(second.risk_flags);
    expect(first.bbr_data).toEqual(second.bbr_data);
  });
});

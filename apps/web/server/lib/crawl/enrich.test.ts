import { describe, expect, it } from "vitest";
import { enrichProperty } from "./enrich.js";
import type { RawListing } from "./types.js";
import type { AddressCadastral } from "../enrichment-sources/address-lookup.js";

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

const cadastral: AddressCadastral = {
  idLokalid: "test-uuid-1",
  matrikelnr: "12a",
  ejerlav: "Testby Ejerlav",
  ejerlavskode: "620551",
  zone: "byzone",
};

describe("enrichProperty (mock mode)", () => {
  it("derives a deterministic price-per-sqm and flags a pre-1970 oil tank risk via the building-year heuristic", async () => {
    const result = await enrichProperty(listing);
    expect(result.calculated_metrics.pricePerSqm).toBe(20000);
    expect(result.risk_flags.oilTankRisk).toBe(true);
    expect(result.risk_flags.oilTankRiskSource).toBe("heuristic");
    expect(result.source).toBe("mock");
  });

  it("is deterministic across repeated calls for the same external_id", async () => {
    const first = await enrichProperty(listing);
    const second = await enrichProperty(listing);
    expect(first.risk_flags).toEqual(second.risk_flags);
    expect(first.bbr_data).toEqual(second.bbr_data);
  });

  it("always marks encumbranceCheckRequired (advisory, tinglysning.dk has no open API)", async () => {
    const result = await enrichProperty(listing);
    expect(result.risk_flags.encumbranceCheckRequired).toBe(true);
  });

  it("builds a tinglysning.dk lookup URL when cadastral data is available", async () => {
    const result = await enrichProperty(listing, cadastral);
    expect(result.risk_flags.encumbranceLookupUrl).toBe("https://www.tinglysning.dk/");
  });

  it("builds a jordforureningsattest URL when cadastral data is available", async () => {
    const result = await enrichProperty(listing, cadastral);
    expect(result.risk_flags.soilContaminationAttestUrl).toBe(
      "https://jord.miljoeportal.dk/report/?elav=620551&matrnr=12a",
    );
  });

  it("leaves soilContaminationAttestUrl null without cadastral data", async () => {
    const result = await enrichProperty(listing, null);
    expect(result.risk_flags.soilContaminationAttestUrl).toBeNull();
  });

  it("leaves encumbranceLookupUrl null without cadastral data", async () => {
    const result = await enrichProperty(listing, null);
    expect(result.risk_flags.encumbranceLookupUrl).toBeNull();
  });

  it("derives noise exposure from the listing's coordinates, independent of cadastral input", async () => {
    const withCadastral = await enrichProperty(listing, cadastral);
    const withoutCadastral = await enrichProperty(listing, null);
    expect(withCadastral.risk_flags.noiseExposureLden).toBe(withoutCadastral.risk_flags.noiseExposureLden);
    expect(withCadastral.risk_flags.noiseExposureLden).not.toBeNull();
  });

  it("always marks sewerSeparationCheckRequired (advisory, no unified municipal spildevandsplan API)", async () => {
    const result = await enrichProperty(listing);
    expect(result.risk_flags.sewerSeparationCheckRequired).toBe(true);
  });

  it("builds a spildevandsplan lookup URL for a municipality in the lookup table", async () => {
    const result = await enrichProperty(listing);
    expect(result.risk_flags.sewerSeparationLookupUrl).toBe("https://www.aalborg.dk/");
  });

  it("populates BBR building facts (materials, heating, counts) when cadastral id_lokalid is available", async () => {
    const result = await enrichProperty(listing, cadastral);
    expect(result.bbr_data.wallMaterial).not.toBeNull();
    expect(result.bbr_data.roofMaterial).not.toBeNull();
    expect(result.bbr_data.heatingInstallation).not.toBeNull();
    expect(result.bbr_data.floors).not.toBeNull();
    expect(result.bbr_data.toiletCount).not.toBeNull();
    expect(result.bbr_data.bathroomCount).not.toBeNull();
  });

  it("falls back to listing-derived bbr_data without cadastral data", async () => {
    const result = await enrichProperty(listing, null);
    expect(result.bbr_data.yearBuilt).toBe(listing.building_year);
    expect(result.bbr_data.areaSqm).toBe(listing.sqm);
    expect(result.bbr_data.wallMaterial).toBeNull();
  });

  it("soilContamination classification is 'none' or 'v2' in mock mode, never left as boolean", async () => {
    const result = await enrichProperty(listing);
    expect(["none", "v2"]).toContain(result.risk_flags.soilContamination.classification);
  });
});

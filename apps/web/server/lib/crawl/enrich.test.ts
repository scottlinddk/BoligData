import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrichProperty } from "./enrich.js";
import { lookupBbr } from "../enrichment-sources/bbr.js";
import { lookupBbrTanks } from "../enrichment-sources/bbr-tanks.js";
import { lookupEjendomsvurdering } from "../enrichment-sources/ejendomsvurdering.js";
import { lookupLand } from "../enrichment-sources/matrikel.js";
import { lookupNoiseExposure } from "../enrichment-sources/stoejkort.js";
import { lookupSoilContamination } from "../enrichment-sources/miljoeportalen-v1v2.js";
import { riskStatuses } from "../../../../../packages/shared/src/utils/risk-status.js";
import type { RawListing } from "./types.js";

vi.mock("../enrichment-sources/bbr.js", () => ({ lookupBbr: vi.fn() }));
vi.mock("../enrichment-sources/bbr-tanks.js", () => ({ lookupBbrTanks: vi.fn() }));
vi.mock("../enrichment-sources/ejendomsvurdering.js", () => ({ lookupEjendomsvurdering: vi.fn() }));
vi.mock("../enrichment-sources/matrikel.js", () => ({ lookupLand: vi.fn() }));
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
  vi.mocked(lookupLand).mockResolvedValue({ ok: false, error: "missing credential" });
  vi.mocked(lookupBbrTanks).mockResolvedValue({ ok: false, error: "missing credential" });
  vi.mocked(lookupNoiseExposure).mockResolvedValue({ ok: false, error: "not configured" });
  vi.mocked(lookupSoilContamination).mockResolvedValue({ ok: false, error: "source unavailable" });
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
  it("attempts live enrichment when the global flag is unset", async () => {
    vi.stubEnv("ENRICH_MOCK_MODE", undefined);
    const result = await enrichProperty(listing);
    expect(lookupBbr).toHaveBeenCalledOnce();
    expect(result.source_status.bbr?.dataMode).toBe("unavailable");
  });

  it("omits synthetic register data even when a different register is live", async () => {
    vi.stubEnv("BBR_MOCK_MODE", "true");
    vi.mocked(lookupEjendomsvurdering).mockResolvedValue({ ok: true, data: { assessedPropertyValueDkk: 2_000_000, assessedLandValueDkk: 500_000, valuationYear: 2024, previousYear: null, previousPropertyValueDkk: null } });
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
    expect(lookupLand).not.toHaveBeenCalled();
    expect(lookupBbrTanks).not.toHaveBeenCalled();
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

describe("due-diligence flags from live registers", () => {
  const cadastral = {
    idLokalid: "0a3f509c-4f33-32b8-e044-0003ba298018", matrikelnr: null, ejerlav: null, ejerlavskode: null, bfeNummer: null,
    zone: null, lat: 57.046, lon: 9.913, postalCode: "9000", postalName: "Aalborg", municipalityCode: "0851",
    formattedAddress: "Hasserisgade 3, 9000 Aalborg", resolvedVia: "adressevaelger" as const,
  };

  it("answers noise, oil tank and soil from the registers instead of leaving them unknown", async () => {
    vi.mocked(lookupBbr).mockResolvedValue({ ok: true, data: {
      yearBuilt: 1930, renovationYear: null, areaSqm: 140, buildingType: "Fritliggende enfamilieshus", floors: 2,
      roofMaterial: null, wallMaterial: null, heatingInstallation: "fjernvarme", basementSqm: null, toiletCount: null, bathroomCount: null,
    } });
    vi.mocked(lookupNoiseExposure).mockResolvedValue({ ok: true, data: { ldenDb: 60, band: { lowerDb: 60, upperDb: 64, source: "roads_in_towns" } } });
    vi.mocked(lookupSoilContamination).mockResolvedValue({ ok: true, data: { classification: "v1", attestUrl: "https://jord.miljoeportal.dk/report/?elav=2005051&matrnr=327b", locationName: "Tidligere autoværksted" } });

    const flags = (await enrichProperty(listing, cadastral)).risk_flags;

    expect(riskStatuses(flags)).toEqual({ noise: "warning", oilTank: "ok", soil: "warning" });
    expect(flags).toMatchObject({
      oilTankRiskSource: "bbr", heatingInstallation: "fjernvarme",
      soilContaminationAttestUrl: "https://jord.miljoeportal.dk/report/?elav=2005051&matrnr=327b",
      encumbranceLookupUrl: "https://www.tinglysning.dk/", sewerSeparationLookupUrl: "https://www.aalborg.dk/",
    });
  });

  it("reads 'no mapped noise zone' as ok, but a failed noise lookup as unknown", async () => {
    vi.mocked(lookupNoiseExposure).mockResolvedValue({ ok: true, data: { ldenDb: null, band: null } });
    expect(riskStatuses((await enrichProperty(listing, cadastral)).risk_flags).noise).toBe("ok");
    vi.mocked(lookupNoiseExposure).mockResolvedValue({ ok: false, error: "HTTP 503" });
    expect(riskStatuses((await enrichProperty(listing, cadastral)).risk_flags).noise).toBe("unknown");
  });

  it("keeps the labelled building-year heuristic when BBR records central heating of unknown fuel", async () => {
    vi.mocked(lookupBbr).mockResolvedValue({ ok: true, data: {
      yearBuilt: 1960, renovationYear: null, areaSqm: 140, buildingType: null, floors: null,
      roofMaterial: null, wallMaterial: null, heatingInstallation: "centralvarme", basementSqm: null, toiletCount: null, bathroomCount: null,
    } });
    expect((await enrichProperty(listing, cadastral)).risk_flags).toMatchObject({ oilTankRisk: true, oilTankRiskSource: "heuristic" });
  });
  const land = {
    totalAreaSqm: 812, parcelCount: 1, forestReserve: { areaSqm: 300 }, beachProtection: null, duneProtection: null,
    entailedForest: false, agriculturalNote: null, commonLot: false, condominiumParent: false,
  };
  const tank = {
    sizeLiters: 1500, manufacturedYear: 1978, installedYear: 1978, decommissionDeadline: "2028-12-31", decommissionedYear: null,
    decommissioned: false, inOperation: true, placementCode: null, contentCode: null,
  };

  it("asks MAT, the tank register and VUR by the address's husnummer and BFE, and keeps their answers in the flags", async () => {
    vi.mocked(lookupLand).mockResolvedValue({ ok: true, data: land });
    vi.mocked(lookupBbrTanks).mockResolvedValue({ ok: true, data: { tanks: [tank] } });
    vi.mocked(lookupEjendomsvurdering).mockResolvedValue({ ok: true, data: {
      assessedPropertyValueDkk: 3_150_000, assessedLandValueDkk: 780_000, valuationYear: 2024, previousYear: 2022, previousPropertyValueDkk: 2_900_000,
    } });

    const result = await enrichProperty(listing, { ...cadastral, bfeNummer: "2340871", ejerlavskode: "610452", matrikelnr: "42q" });

    expect(lookupLand).toHaveBeenCalledWith({ husnummerId: cadastral.idLokalid, bfeNummer: "2340871", matrikelnr: "42q", ejerlavskode: "610452" });
    expect(lookupBbrTanks).toHaveBeenCalledWith(cadastral.idLokalid);
    expect(lookupEjendomsvurdering).toHaveBeenCalledWith({ husnummerId: cadastral.idLokalid, bfeNummer: "2340871", matrikelnr: "42q", ejerlav: null });
    expect(result.risk_flags).toMatchObject({
      landRegistration: land,
      oilTanks: { tanks: [tank] },
      valuation: { year: 2024, propertyValueDkk: 3_150_000, previousYear: 2022, previousPropertyValueDkk: 2_900_000 },
    });
    expect(result.source_status.land?.dataMode).toBe("real");
    expect(result.source_status.oil_tanks?.dataMode).toBe("real");
    // The stored valuation keeps its three-field shape.
    expect(result.public_valuation).toEqual({ assessedPropertyValueDkk: 3_150_000, assessedLandValueDkk: 780_000, valuationYear: 2024 });
  });

  it("treats a tank BBR still registers as a finding even when the heating is not oil", async () => {
    vi.mocked(lookupBbr).mockResolvedValue({ ok: true, data: {
      yearBuilt: 1930, renovationYear: null, areaSqm: 140, buildingType: null, floors: 2,
      roofMaterial: null, wallMaterial: null, heatingInstallation: "fjernvarme", basementSqm: null, toiletCount: null, bathroomCount: null,
    } });
    vi.mocked(lookupBbrTanks).mockResolvedValue({ ok: true, data: { tanks: [tank] } });
    const flags = (await enrichProperty(listing, cadastral)).risk_flags;
    expect(flags).toMatchObject({ oilTankRisk: true, oilTankRiskSource: "bbr" });
    expect(riskStatuses(flags).oilTank).toBe("warning");
  });

  it("does not let a decommissioned tank override what the heating says", async () => {
    vi.mocked(lookupBbr).mockResolvedValue({ ok: true, data: {
      yearBuilt: 1930, renovationYear: null, areaSqm: 140, buildingType: null, floors: 2,
      roofMaterial: null, wallMaterial: null, heatingInstallation: "fjernvarme", basementSqm: null, toiletCount: null, bathroomCount: null,
    } });
    vi.mocked(lookupBbrTanks).mockResolvedValue({ ok: true, data: { tanks: [{ ...tank, decommissioned: true, decommissionedYear: 2014 }] } });
    const flags = (await enrichProperty(listing, cadastral)).risk_flags;
    expect(riskStatuses(flags).oilTank).toBe("ok");
    expect(flags.oilTanks?.tanks).toHaveLength(1);
  });

  it("leaves the land, tank and valuation flags null when their registers did not answer", async () => {
    const flags = (await enrichProperty(listing, cadastral)).risk_flags;
    expect(flags).toMatchObject({ landRegistration: null, oilTanks: null, valuation: null });
  });
});

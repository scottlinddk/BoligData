import { describe, expect, it } from "vitest";
import type { PropertyLookupResult, PropertyLookupSourceStatus } from "@shared/types/property-lookup";
import { buildAddressReport, openStreetMapUrl } from "./address-report";

const live = (key: PropertyLookupSourceStatus["key"]): PropertyLookupSourceStatus => ({ key, register: key, mode: "live", error: null });
const mock = (key: PropertyLookupSourceStatus["key"]): PropertyLookupSourceStatus => ({ key, register: key, mode: "mock", error: null });
const unavailable = (key: PropertyLookupSourceStatus["key"], error: string): PropertyLookupSourceStatus => ({ key, register: key, mode: "unavailable", error });

function lookup(overrides: Partial<PropertyLookupResult> = {}): PropertyLookupResult {
  return {
    address: "Floravej 6, 9000 Aalborg",
    resolved: {
      idLokalid: "0a3f509c-38ed-32b8-e044-0003ba298018",
      matrikelnr: null, ejerlav: null, ejerlavskode: null, bfeNummer: null, zone: null,
      formattedAddress: "Floravej 6, 9000 Aalborg", postalCode: "9000", lat: 57.0459, lon: 9.8764,
    },
    bbrData: {
      yearBuilt: 1962, renovationYear: null, energyLabel: "B", areaSqm: null, buildingType: null, heatingInstallation: "fjernvarme",
      floors: 1, roofMaterial: null, wallMaterial: null, basementSqm: null, toiletCount: null, bathroomCount: null,
    },
    publicValuation: { assessedPropertyValueDkk: 3_150_000, assessedLandValueDkk: 780_000, valuationYear: 2025 },
    valuationHistory: [], propertyClass: null, priceHistoryMatch: null, riskFlags: null,
    priceHistory: [{ soldDate: "2018-05-01", price: 2_100_000, pricePerSqm: 14_000, saleType: "normal" }],
    nearbySales: [{ address: "Floravej 8", soldDate: "2026-03-01", price: 2_500_000, pricePerSqm: 17_000, saleType: "normal", areaSqm: 150, propertyType: "villa", distanceMeters: 40, lat: 57.0460, lon: 9.8766 }],
    renovationCategory: { category: "B", isEstimate: true, symbol: "~", reason: "", source: "ai" },
    screening: [],
    scoringInputs: { locationMatch: null, conditionProxy: 3, priceHeadroomDkk: null, areaMarginSqm: null, schoolDistrictScore: null, noiseZoneEstimate: null, legalRiskProxy: null, source: "ai" },
    sources: [live("address"), live("bbr"), live("publicValuation"), live("noise"), live("sales")],
    dataMode: "live",
    source: "ai",
    ...overrides,
  };
}

describe("buildAddressReport", () => {
  it("shows every group whose register answered live", () => {
    const report = buildAddressReport(lookup());
    expect(report.address).toBe("Floravej 6, 9000 Aalborg");
    expect(report.postalCode).toBe("9000");
    expect(report.bbrData?.yearBuilt).toBe(1962);
    expect(report.publicValuation?.assessedPropertyValueDkk).toBe(3_150_000);
    expect(report.priceHistory).toHaveLength(1);
    expect(report.nearbySales).toHaveLength(1);
    expect(report.sources.map((s) => s.key)).toEqual(["address", "bbr", "publicValuation", "noise", "sales"]);
  });

  it("does not present the caller-supplied energy label as a register fact", () => {
    expect(buildAddressReport(lookup()).bbrData?.energyLabel).toBeNull();
  });

  it("withholds a group whose source is mock or unavailable rather than showing it as live", () => {
    const report = buildAddressReport(lookup({
      sources: [live("address"), mock("bbr"), unavailable("publicValuation", "no BFE"), live("noise"), unavailable("sales", "HTTP 503")],
    }));
    expect(report.bbrData).toBeNull();
    expect(report.publicValuation).toBeNull();
    expect(report.priceHistory).toEqual([]);
    expect(report.nearbySales).toEqual([]);
    expect(report.sources.find((s) => s.key === "publicValuation")?.error).toBe("no BFE");
  });

  it("says whether the sales register answered, and how the history was attributed", () => {
    const live = buildAddressReport(lookup({ priceHistoryMatch: "matched" }));
    expect(live).toMatchObject({ salesAvailable: true, priceHistoryMatch: "matched" });
    expect(buildAddressReport(lookup({ priceHistoryMatch: "ambiguous" })).priceHistoryMatch).toBe("ambiguous");
  });

  it("makes an empty history 'unknown' rather than 'never sold' when the sales register did not answer", () => {
    const report = buildAddressReport(lookup({
      priceHistoryMatch: "matched",
      sources: [live("address"), live("bbr"), live("publicValuation"), live("noise"), unavailable("sales", "HTTP 503")],
    }));
    expect(report).toMatchObject({ salesAvailable: false, priceHistoryMatch: null, priceHistory: [] });
  });

  it("treats an all-null BBR or valuation record as no data", () => {
    const report = buildAddressReport(lookup({
      bbrData: { yearBuilt: null, renovationYear: null, energyLabel: null, areaSqm: null, buildingType: null, heatingInstallation: null, floors: null, roofMaterial: null, wallMaterial: null, basementSqm: null, toiletCount: null, bathroomCount: null },
      publicValuation: { assessedPropertyValueDkk: null, assessedLandValueDkk: null, valuationYear: null },
    }));
    expect(report.bbrData).toBeNull();
    expect(report.publicValuation).toBeNull();
  });

  it("exposes no location, address or identifiers when the address itself is unresolved", () => {
    const report = buildAddressReport(lookup({
      address: "",
      sources: [unavailable("address", "HTTP 404"), live("bbr"), live("publicValuation"), live("noise"), live("sales")],
    }));
    expect(report.lat).toBeNull();
    expect(report.lon).toBeNull();
    expect(report.mapUrl).toBeNull();
    expect(report.address).toBe("");
    expect(report.postalCode).toBeNull();
  });

  it("passes the server's fair-price estimate through, keeping 'failed' and 'not asked for' apart", () => {
    const estimate = { status: "available", askingPrice: null } as unknown as NonNullable<PropertyLookupResult["spar"]>;
    expect(buildAddressReport(lookup({ spar: estimate })).spar).toBe(estimate);
    expect(buildAddressReport(lookup({ spar: null })).spar).toBeNull();
    expect(buildAddressReport(lookup()).spar).toBeUndefined();
  });

  it("keeps the estimate even when the valuation source is not live, since 'not a house' is an answer", () => {
    const unsupported = { status: "no_valuation", reason: "unsupported_property_type" } as unknown as NonNullable<PropertyLookupResult["spar"]>;
    const report = buildAddressReport(lookup({
      spar: unsupported,
      sources: [live("address"), live("bbr"), unavailable("publicValuation", "not a house"), live("noise"), live("sales")],
    }));
    expect(report.spar).toBe(unsupported);
    expect(report.publicValuation).toBeNull();
  });

  it("passes the due-diligence flags through, for the checklist to render", () => {
    const riskFlags = { noiseExposureLden: 52, oilTankRisk: false } as unknown as NonNullable<PropertyLookupResult["riskFlags"]>;
    expect(buildAddressReport(lookup({ riskFlags })).riskFlags).toBe(riskFlags);
    expect(buildAddressReport(lookup()).riskFlags).toBeNull();
  });

  it("never includes an asking price or any screening verdict in the report", () => {
    const report = buildAddressReport(lookup());
    expect(Object.keys(report).some((key) => /price(?!History)|screening|ask/i.test(key))).toBe(false);
  });
});

describe("openStreetMapUrl", () => {
  it("builds a marker link centred on the address", () => {
    expect(openStreetMapUrl(57.0459197, 9.8764013)).toBe(
      "https://www.openstreetmap.org/?mlat=57.045920&mlon=9.876401#map=18/57.045920/9.876401",
    );
  });

  it("is null without usable coordinates", () => {
    expect(openStreetMapUrl(null, 9)).toBeNull();
    expect(openStreetMapUrl(57, Number.NaN)).toBeNull();
  });
});

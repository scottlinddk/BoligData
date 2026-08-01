import { describe, expect, it } from "vitest";
import { mergePropertyFacts, summarizeLookupSources } from "./property-facts";
import type { BbrData, Enrichment, Property } from "@shared/types/index";
import type { PropertyLookupResult } from "@shared/types/property-lookup";

const property = {
  id: "p1",
  address: "Floravej 6, 9000 Aalborg",
  postalCode: "9000",
  price: 5_000_000,
  sqm: 150,
  buildingYear: 1970,
  matrikelnr: null,
  ejerlav: null,
  zone: "landzone",
  registeredAreaSqm: null,
  lat: 57.04,
  lon: 9.87,
} as unknown as Property;

const storedBbr: BbrData = {
  yearBuilt: 1970,
  renovationYear: 1990,
  energyLabel: "C",
  areaSqm: 150,
  buildingType: "villa",
  heatingInstallation: "elvarme",
  floors: 2,
  roofMaterial: "tagpap",
  wallMaterial: "letbeton",
  basementSqm: 40,
  toiletCount: 2,
  bathroomCount: 1,
};

const enrichment = {
  bbrData: storedBbr,
  publicValuation: { assessedPropertyValueDkk: 2_000_000, assessedLandValueDkk: 500_000, valuationYear: 2023 },
  riskFlags: null,
  soldPriceHistory: [],
} as unknown as Enrichment;

function lookup(overrides: Partial<PropertyLookupResult> = {}): PropertyLookupResult {
  return {
    address: property.address,
    resolved: {
      idLokalid: "0a3f509c-38ed-32b8-e044-0003ba298018",
      matrikelnr: "42q",
      ejerlav: "Gl. Hasseris By, Hasseris",
      ejerlavskode: "610452",
      bfeNummer: "3300503",
      zone: null,
      formattedAddress: "Floravej 6, 9000 Aalborg",
      postalCode: "9000",
      lat: 57.04591973,
      lon: 9.87640126,
    },
    bbrData: null,
    publicValuation: null,
    renovationCategory: { category: "D", isEstimate: true, symbol: "~", reason: "", source: "ai" },
    screening: [],
    scoringInputs: {
      locationMatch: null,
      conditionProxy: 1,
      priceHeadroomDkk: 0,
      areaMarginSqm: null,
      schoolDistrictScore: null,
      noiseZoneEstimate: null,
      legalRiskProxy: null,
      source: "ai",
    },
    sources: [
      { key: "address", register: "DAR", mode: "live", error: null },
      { key: "bbr", register: "BBR", mode: "unavailable", error: "DATAFORDELER_API_KEY not configured" },
      { key: "publicValuation", register: "VUR", mode: "unavailable", error: "DATAFORDELER_API_KEY not configured" },
      { key: "noise", register: "Støj", mode: "unavailable", error: "HTTP 400" },
    ],
    dataMode: "unavailable",
    source: "ai",
    ...overrides,
  };
}

const liveBbr: BbrData = {
  ...storedBbr,
  yearBuilt: 1962,
  renovationYear: null,
  areaSqm: 142,
  heatingInstallation: "fjernvarme",
  // BBR's Bygning entity doesn't carry these — they live on Enhed.
  basementSqm: null,
  toiletCount: null,
  bathroomCount: null,
  energyLabel: null,
};

describe("mergePropertyFacts", () => {
  it("falls back to the stored row when there is no lookup yet", () => {
    const facts = mergePropertyFacts(property, enrichment, null);
    expect(facts.bbrSource).toBe("stored");
    expect(facts.bbrData?.yearBuilt).toBe(1970);
    expect(facts.publicValuation?.assessedPropertyValueDkk).toBe(2_000_000);
    expect(facts.valuationSource).toBe("stored");
  });

  it("prefers live register values over the stored row", () => {
    const facts = mergePropertyFacts(property, enrichment, lookup({ bbrData: liveBbr }));
    expect(facts.bbrSource).toBe("register");
    expect(facts.buildingYear).toBe(1962);
    expect(facts.bbrData?.heatingInstallation).toBe("fjernvarme");
    expect(facts.matrikelnr).toBe("42q");
    expect(facts.ejerlav).toBe("Gl. Hasseris By, Hasseris");
    expect(facts.bfeNummer).toBe("3300503");
  });

  it("merges field by field, keeping stored values BBR's Bygning entity cannot answer", () => {
    const facts = mergePropertyFacts(property, enrichment, lookup({ bbrData: liveBbr }));
    // Live where BBR has an answer...
    expect(facts.bbrData?.areaSqm).toBe(142);
    // ...stored where it structurally does not, rather than blanking the page.
    expect(facts.bbrData?.basementSqm).toBe(40);
    expect(facts.bbrData?.toiletCount).toBe(2);
    expect(facts.bbrData?.energyLabel).toBe("C");
  });

  it("surfaces a register/listing area disagreement instead of hiding it", () => {
    const facts = mergePropertyFacts(property, enrichment, lookup({ bbrData: liveBbr }));
    expect(facts.registerAreaSqm).toBe(142);
  });

  it("does not flag an area discrepancy when the two agree", () => {
    const facts = mergePropertyFacts(property, enrichment, lookup({ bbrData: { ...liveBbr, areaSqm: 150 } }));
    expect(facts.registerAreaSqm).toBeNull();
  });

  it("keeps the stored valuation when VUR is unavailable", () => {
    const facts = mergePropertyFacts(property, enrichment, lookup());
    expect(facts.publicValuation?.assessedPropertyValueDkk).toBe(2_000_000);
    expect(facts.valuationSource).toBe("stored");
  });

  it("prefers a live valuation when VUR answers", () => {
    const facts = mergePropertyFacts(
      property,
      enrichment,
      lookup({ publicValuation: { assessedPropertyValueDkk: 3_150_000, assessedLandValueDkk: 780_000, valuationYear: 2025 } }),
    );
    expect(facts.publicValuation?.assessedPropertyValueDkk).toBe(3_150_000);
    expect(facts.valuationSource).toBe("register");
  });

  it("keeps the stored zone, since the address register retired that field", () => {
    const facts = mergePropertyFacts(property, enrichment, lookup());
    expect(facts.zone).toBe("landzone");
  });

  it("survives a property with no enrichment row at all", () => {
    const facts = mergePropertyFacts(property, null, lookup({ bbrData: liveBbr }));
    expect(facts.bbrSource).toBe("register");
    expect(facts.bbrData?.yearBuilt).toBe(1962);
    expect(facts.bbrData?.basementSqm).toBeNull();
    expect(facts.publicValuation).toBeNull();
    expect(facts.valuationSource).toBeNull();
  });

  it("reports no BBR data when neither source has any", () => {
    const facts = mergePropertyFacts(property, null, null);
    expect(facts.bbrData).toBeNull();
    expect(facts.bbrSource).toBeNull();
  });

  it("treats an all-null lookup payload as unusable rather than as a live answer", () => {
    const allNull = Object.fromEntries(Object.keys(storedBbr).map((k) => [k, null])) as unknown as BbrData;
    const facts = mergePropertyFacts(property, enrichment, lookup({ bbrData: allNull }));
    expect(facts.bbrSource).toBe("stored");
    expect(facts.bbrData?.yearBuilt).toBe(1970);
  });
});

describe("summarizeLookupSources", () => {
  it("is empty while there is no lookup", () => {
    expect(summarizeLookupSources(null)).toEqual([]);
  });

  it("carries each register's mode and error through", () => {
    const summary = summarizeLookupSources(lookup());
    expect(summary).toHaveLength(4);
    expect(summary[0]).toEqual({ key: "address", mode: "live", error: null });
    expect(summary[1]?.error).toContain("DATAFORDELER_API_KEY");
  });
});

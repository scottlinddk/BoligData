import { describe, expect, it } from "vitest";
import { mapBoligsidenListingFacts } from "./boligsiden-listing-facts.js";

// Field names and values match the public Skytten 1A, 3. th. case feed.
const home = {
  buildingName: "Etagebolig-bygning, flerfamiliehus eller tofamiliehus",
  housingArea: 43,
  yearBuilt: 1937,
  numberOfFloors: 3,
  externalWallMaterial: "Mursten",
  roofingMaterial: "Fibercement herunder asbest",
  heatingInstallation: "Fjernvarme/blokvarme",
  basementArea: 210,
  numberOfToilets: 1,
  numberOfBathrooms: 1,
};
const garage = { buildingName: "Garage", totalArea: 31, yearBuilt: 1937, roofingMaterial: "Metal" };
const skytten = {
  housingArea: 43, energyLabel: "c", yearBuilt: 1937, numberOfFloors: 3,
  numberOfToilets: 1, numberOfBathrooms: 1,
  address: { livingArea: 43, latestValuation: 500000, buildings: [home, garage] },
};

describe("mapBoligsidenListingFacts", () => {
  it("preserves the source's building facts and keeps missing values unknown", () => {
    expect(mapBoligsidenListingFacts(skytten)).toEqual({
      yearBuilt: 1937, renovationYear: null, energyLabel: "C", areaSqm: 43,
      buildingType: home.buildingName, floors: 3, roofMaterial: "Fibercement herunder asbest",
      wallMaterial: "Mursten", heatingInstallation: "Fjernvarme/blokvarme",
      basementSqm: null, toiletCount: 1, bathroomCount: 1, landAreaSqm: null,
      publicValuation: { assessedPropertyValueDkk: 500000, assessedLandValueDkk: null, valuationYear: null },
    });
  });

  it("selects the home's materials independent of auxiliary-building order", () => {
    const facts = mapBoligsidenListingFacts({ ...skytten, address: { buildings: [garage, home] } });
    expect(facts.roofMaterial).toBe(home.roofingMaterial);
  });

  it("does not take the first residential building when multiple ones match", () => {
    const facts = mapBoligsidenListingFacts({ ...skytten, address: { buildings: [home, { ...home, roofingMaterial: "Tegl" }] } });
    expect(facts.roofMaterial).toBeNull();
    expect(facts.wallMaterial).toBeNull();
    expect(facts.heatingInstallation).toBeNull();
    expect(facts.floors).toBeNull(); // The case's 3 floors do not resolve the building.
    expect(facts.yearBuilt).toBe(1937); // The case still supplies this fact.
  });

  it("rejects building facts whose residential area does not match the unit", () => {
    const facts = mapBoligsidenListingFacts({ ...skytten, housingArea: 116 });
    expect(facts.areaSqm).toBe(116);
    expect(facts.roofMaterial).toBeNull();
    expect(facts.basementSqm).toBeNull();
  });

  it("never substitutes building totals or the apartment floor for unit facts", () => {
    const facts = mapBoligsidenListingFacts({
      ...skytten, numberOfFloors: 1,
      address: { floor: "1", buildings: [home], livingArea: 43 },
    });
    expect(facts.floors).toBe(3);
    expect(facts.areaSqm).toBe(43);
    expect(facts.basementSqm).toBeNull();
  });

  it("maps explicit case land/basement areas, renovation year and valid zero counts", () => {
    const facts = mapBoligsidenListingFacts({
      ...skytten, lotArea: 580, basementArea: 0, numberOfBathrooms: 0, numberOfToilets: 0,
      address: { buildings: [{ ...home, yearRenovated: "2008" }] },
    });
    expect(facts).toMatchObject({ landAreaSqm: 580, basementSqm: 0, bathroomCount: 0, toiletCount: 0, renovationYear: 2008 });
  });

  it("does not invent numeric facts from malformed payloads or truncated counts", () => {
    const facts = mapBoligsidenListingFacts({
      housingArea: -12, energyLabel: "unknown", yearBuilt: 0, numberOfFloors: 1.5,
      numberOfToilets: -1, numberOfBathrooms: "not known", lotArea: false, basementArea: Number.NaN,
      address: { latestValuation: -100, buildings: [null, [], {}] },
    });
    expect(Object.values(facts).every(value => value === null)).toBe(true);
  });

  it.each([null, undefined, [], "not a case"])("handles a missing or invalid record %j", raw => {
    expect(Object.values(mapBoligsidenListingFacts(raw)).every(value => value === null)).toBe(true);
  });
});

import type { ListingSourceFacts } from "../../../../../packages/shared/src/types/index.js";
import { asFiniteNumber, asNonEmptyString, asPositiveNumber } from "./map-utils.js";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function integer(value: unknown, minimum = 0): number | null {
  const number = asFiniteNumber(value);
  return number !== null && Number.isSafeInteger(number) && number >= minimum ? number : null;
}

function area(value: unknown): number | null {
  const number = asFiniteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function year(value: unknown): number | null {
  const number = integer(value, 1000);
  return number !== null && number <= 9999 ? number : null;
}

/** A plot can contain a home, garage and shed. Never take buildings[0] or
 * borrow materials from an arbitrary auxiliary building. The live feed
 * carries housingArea for the address's residential unit. Only a unique
 * area match can select it when an advertised area is known. */
function residentialBuilding(address: Record<string, unknown>, listingArea: number | null): Record<string, unknown> {
  const buildings = Array.isArray(address.buildings) ? address.buildings.map(record) : [];
  const homes = buildings.filter((building) => asPositiveNumber(building.housingArea) !== null);
  const matches = listingArea === null ? homes : homes.filter((building) => asPositiveNumber(building.housingArea) === listingArea);
  return matches.length === 1 ? matches[0]! : {};
}

/** Maps the source's own facts after the caller confirms the case identity.
 * Field names were checked against Boligsiden's public search/cases feed.
 * No values here are promoted into official BBR/VUR enrichment. */
export function mapBoligsidenListingFacts(rawCase: unknown): ListingSourceFacts {
  const listing = record(rawCase);
  const address = record(listing.address);
  const areaSqm = asPositiveNumber(listing.housingArea) ?? asPositiveNumber(address.livingArea);
  const building = residentialBuilding(address, areaSqm);
  const label = asNonEmptyString(listing.energyLabel)?.toUpperCase() ?? asNonEmptyString(address.energyLabel)?.toUpperCase();
  const valuation = asPositiveNumber(address.latestValuation);

  return {
    yearBuilt: year(building.yearBuilt) ?? year(listing.yearBuilt),
    renovationYear: year(building.yearRenovated),
    energyLabel: label && /^(?:A(?:1|2|20|2010|2015|2020)?|[B-G])$/.test(label) ? label : null,
    areaSqm,
    buildingType: asNonEmptyString(building.buildingName),
    floors: integer(building.numberOfFloors, 1),
    roofMaterial: asNonEmptyString(building.roofingMaterial),
    wallMaterial: asNonEmptyString(building.externalWallMaterial),
    heatingInstallation: asNonEmptyString(building.heatingInstallation),
    // Skytten's building reports 210 m² here for every apartment; that is
    // not the apartment's basement. Only an explicit case area is usable.
    basementSqm: area(listing.basementArea),
    toiletCount: integer(listing.numberOfToilets) ?? integer(building.numberOfToilets),
    bathroomCount: integer(listing.numberOfBathrooms) ?? integer(building.numberOfBathrooms),
    landAreaSqm: area(listing.lotArea),
    publicValuation: valuation === null ? null : {
      assessedPropertyValueDkk: valuation,
      assessedLandValueDkk: null,
      valuationYear: null,
    },
  };
}

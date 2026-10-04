import type { SchoolDistrictResult } from "../../../../packages/shared/src/types/school-district.js";
import { lookupLifaSchoolDistrict } from "./school-district/lifa.js";
import { embeddedPostcode, emptyResult, parseSchoolAddress } from "./school-district/shared.js";
import { lookupSkoledistrikt, SKOLEDISTRIKT_ORIGIN } from "./school-district/skoledistrikt.js";

export interface SchoolDistrictInput {
  address: string;
  postalCode: string | null;
  idLokalid: string | null;
  dataMode?: string;
}

/**
 * LIFA AdresseService (the municipalities' district register) is asked first.
 * Skoledistrikt.dk, which republishes LIFA/GeoFA data, answers only when LIFA
 * gives no verified district, so its stricter address handling stays the floor.
 */
export async function lookupSchoolDistrict(input: SchoolDistrictInput): Promise<SchoolDistrictResult> {
  const unavailable = (reason: SchoolDistrictResult["reason"]): SchoolDistrictResult =>
    ({ ...emptyResult(`${SKOLEDISTRIKT_ORIGIN}/`), reason });
  if (input.dataMode === "mock" || input.dataMode === "demo") return unavailable("nonlive_data");
  const expected = parseSchoolAddress(input.address, input.postalCode);
  if (!expected?.postalCode || !/^\d{4}$/.test(expected.postalCode)) return unavailable("address_missing");
  // Reject conflicting explicit postcodes rather than overriding one with a hint.
  const suppliedPostcode = embeddedPostcode(input.address);
  if (suppliedPostcode && suppliedPostcode !== expected.postalCode) return unavailable("address_mismatch");

  return await lookupLifaSchoolDistrict(expected, input.idLokalid) ?? await lookupSkoledistrikt(expected, input.idLokalid);
}

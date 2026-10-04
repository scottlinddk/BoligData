import type { SchoolDistrictMatch, SchoolDistrictResult } from "../../../../../packages/shared/src/types/school-district.js";
import { fetchJson } from "../crawl/http.js";
import { isUuid } from "../http-helpers.js";
import { emptyResult, normalize, record, sameAddressParts, text, type SchoolAddress } from "./shared.js";

export const LIFA_ORIGIN = "https://adresseservice.lifa.dk";
const LIFA_REQUEST_OPTIONS = { timeoutMs: 4_000, attempts: 1 };
const MAX_DEPTH = 6;
const MAX_NODES = 5_000;
const MAX_DISTRICTS = 30;

/* LIFA AdresseService, "Service A: AdresseDistrikter/Skole" (LIFA notat v5.0).
 * GET /api/AdresseDistrikter/Skole?id=<adresse-uuid> or ?vejnavn=&husnr=
 * Documented fields: address (adr_id, vejnavn, adresseringsvejnavn, husnr,
 * postnr, postnrnavn, kommunekode) and district (distriktsnr, distriktsnavn,
 * distriktstype, starttrinkode, starttrin, sluttrinkode, sluttrin).
 * The documentation does not pin down how districts are nested under the
 * address, so the parser locates records by their documented fields rather
 * than by envelope keys, and anything it cannot verify yields null so the
 * caller falls back to Skoledistrikt.dk.
 */

interface LifaAddress {
  id: string | null;
  parts: SchoolAddress;
  label: string;
  districts: SchoolDistrictMatch[];
  districtKeys: Set<string>;
}

/** Strings and numbers both occur in DAWA-era services (postnr 9000 vs "9000"). */
function scalar(value: unknown, limit = 120): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return text(value, limit);
}

function gradeOf(code: unknown, label: unknown): number | null {
  for (const value of [code, label]) {
    const raw = scalar(value);
    if (raw === null) continue;
    if (/^b(ø|oe)rnehave/i.test(raw)) return 0;
    const match = /^0*(\d{1,2})(?:\.|\s|$)/.exec(raw);
    if (match) {
      const grade = Number(match[1]);
      if (grade >= 0 && grade <= 10) return grade;
    }
  }
  return null;
}

function asAddress(item: Record<string, unknown>): LifaAddress | null {
  const streetName = scalar(item.adresseringsvejnavn) ?? scalar(item.vejnavn);
  const houseNumber = scalar(item.husnr, 10)?.replace(/\s+/g, "") ?? null;
  const postalCode = scalar(item.postnr, 4);
  if (!streetName || !houseNumber) return null;
  const rawId = [item.adr_id, item.adgangsadresseid, item.id].find(isUuid);
  const city = scalar(item.postnrnavn);
  return {
    id: rawId ? rawId.toLowerCase() : null,
    parts: { streetName, houseNumber, postalCode: postalCode && /^\d{4}$/.test(postalCode) ? postalCode : null },
    label: `${streetName} ${houseNumber}${postalCode ? `, ${postalCode}${city ? ` ${city}` : ""}` : ""}`,
    districts: [], districtKeys: new Set(),
  };
}

function asDistrict(item: Record<string, unknown>): SchoolDistrictMatch | null {
  const schoolName = text(item.distriktsnavn);
  if (!schoolName) return null;
  let firstGrade = gradeOf(item.starttrinkode, item.starttrin);
  let lastGrade = gradeOf(item.sluttrinkode, item.sluttrin);
  if (firstGrade !== null && lastGrade !== null && firstGrade > lastGrade) { firstGrade = null; lastGrade = null; }
  return { schoolName, schoolUrl: null, firstGrade, lastGrade };
}

function addDistrict(address: LifaAddress, district: SchoolDistrictMatch) {
  const key = `${normalize(district.schoolName)}|${district.firstGrade}|${district.lastGrade}`;
  if (address.districtKeys.has(key)) return;
  address.districtKeys.add(key);
  address.districts.push(district);
}

/** Walks the response once; districts attach to the nearest enclosing address record. */
export function parseLifaResponse(body: unknown): LifaAddress[] | null {
  const addresses: LifaAddress[] = [];
  const orphans: SchoolDistrictMatch[] = [];
  let nodes = 0;
  const visit = (value: unknown, owner: LifaAddress | null, depth: number): boolean => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) return false;
    if (Array.isArray(value)) return value.every(item => visit(item, owner, depth + 1));
    const item = record(value);
    if (!item) return true;
    const address = asAddress(item);
    if (address) addresses.push(address);
    const current = address ?? owner;
    const district = asDistrict(item);
    if (district) {
      if (current) addDistrict(current, district); else orphans.push(district);
    }
    return Object.values(item).every(child => typeof child !== "object" || child === null || visit(child, current, depth + 1));
  };
  if (!visit(body, null, 0)) return null;
  // Sibling layout, e.g. { adresse: {...}, distrikter: [...] }, has exactly one address.
  if (orphans.length > 0) {
    if (addresses.length !== 1) return null;
    orphans.forEach(district => addDistrict(addresses[0]!, district));
  }
  return addresses;
}

/**
 * Returns an `available` result only when the response names exactly one
 * address that matches street, house number and postcode, and that address
 * has at least one school district. Everything else returns null.
 */
export async function lookupLifaSchoolDistrict(expected: SchoolAddress, idLokalid: string | null): Promise<SchoolDistrictResult | null> {
  const requestedId = isUuid(idLokalid) ? idLokalid.toLowerCase() : null;
  const query = requestedId
    ? new URLSearchParams({ id: requestedId })
    : new URLSearchParams({ vejnavn: expected.streetName, husnr: expected.houseNumber });
  const sourceUrl = `${LIFA_ORIGIN}/api/AdresseDistrikter/Skole?${query}`;
  try {
    const addresses = parseLifaResponse(await fetchJson<unknown>(sourceUrl, LIFA_REQUEST_OPTIONS));
    if (!addresses) return null;
    const candidates = addresses.filter(address => sameAddressParts(expected, address.parts) &&
      (!requestedId || address.id === null || address.id === requestedId));
    // Unit-level rows repeat the entrance; merge them, but never merge two different entrances.
    const ids = new Set(candidates.map(address => address.id ?? normalize(address.label)));
    if (ids.size !== 1) return null;
    const merged = candidates[0]!;
    candidates.slice(1).forEach(address => address.districts.forEach(district => addDistrict(merged, district)));
    if (merged.districts.length === 0 || merged.districts.length > MAX_DISTRICTS) return null;
    return {
      ...emptyResult(sourceUrl), status: "available", provider: "lifa",
      addressId: merged.id ?? requestedId, address: merged.label, matches: merged.districts,
      source: "LIFA AdresseService",
    };
  } catch {
    // The fallback source decides what the user sees; never surface LIFA errors.
    return null;
  }
}

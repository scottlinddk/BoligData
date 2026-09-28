import type { SchoolDistrictMatch, SchoolDistrictResult } from "../../../../packages/shared/src/types/school-district.js";
import { fetchJson } from "./crawl/http.js";
import { isUuid } from "./http-helpers.js";
import { parseStructuredAddress } from "./enrichment-sources/address-lookup-dar-fallback.js";

const ORIGIN = "https://skoledistrikt.dk";
const REQUEST_OPTIONS = { timeoutMs: 5_000, attempts: 1 };

export interface SchoolDistrictInput {
  address: string;
  postalCode: string | null;
  idLokalid: string | null;
  dataMode?: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown, limit = 300): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit ? value.trim() : null;
}

const normalize = (value: string) => value.normalize("NFC").toLocaleLowerCase("da-DK").replace(/\s+/g, " ").trim();
const grade = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10 ? value : null;
const slug = (value: unknown) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : null;

/** A house/street number in the first segment must never become a postcode. */
function embeddedPostcode(address: string): string | null {
  const segments = address.split(",");
  if (segments.length < 2) return null;
  return /^\s*(\d{4})(?:\s+\p{L}.*)?\s*$/u.exec(segments.at(-1)!)?.[1] ?? null;
}

function parseSchoolAddress(address: string, postalCodeHint: string | null) {
  const structured = parseStructuredAddress(address, postalCodeHint);
  return structured ? { ...structured, postalCode: postalCodeHint ?? embeddedPostcode(address) } : null;
}

function sameAddress(expected: NonNullable<ReturnType<typeof parseSchoolAddress>>, address: string) {
  const actual = parseSchoolAddress(address, null);
  return actual !== null && actual.postalCode === expected.postalCode &&
    normalize(actual.streetName) === normalize(expected.streetName) &&
    normalize(actual.houseNumber) === normalize(expected.houseNumber);
}

/** Uses only a stored DAR Husnummer or a unique exact autocomplete match.
 * The source's response must corroborate street, house number and postcode.
 * Public endpoints and their response shape were checked on 2026-09-28.
 */
export async function lookupSchoolDistrict(input: SchoolDistrictInput): Promise<SchoolDistrictResult> {
  const result: SchoolDistrictResult = {
    status: "unavailable", reason: null, addressId: null, address: null, municipality: null,
    matches: [], confidence: "unknown", source: null, sourceUrl: `${ORIGIN}/`,
    checkedAt: new Date().toISOString(), disclaimer: null,
  };
  const unavailable = (reason: SchoolDistrictResult["reason"]): SchoolDistrictResult => ({ ...result, reason });
  if (input.dataMode === "mock" || input.dataMode === "demo") return unavailable("nonlive_data");
  const expected = parseSchoolAddress(input.address, input.postalCode);
  if (!expected?.postalCode || !/^\d{4}$/.test(expected.postalCode)) return unavailable("address_missing");
  // Reject conflicting explicit postcodes rather than overriding one with a hint.
  const suppliedPostcode = embeddedPostcode(input.address);
  if (suppliedPostcode && suppliedPostcode !== expected.postalCode) return unavailable("address_mismatch");

  try {
    let addressId = isUuid(input.idLokalid) ? input.idLokalid.toLowerCase() : null;
    if (!addressId) {
      const query = new URLSearchParams({ q: `${expected.streetName} ${expected.houseNumber}, ${expected.postalCode}` });
      const suggestions = await fetchJson<unknown>(`${ORIGIN}/api/address/autocomplete?${query}`, REQUEST_OPTIONS);
      if (!Array.isArray(suggestions)) return unavailable("invalid_response");
      const exact = suggestions.flatMap(value => {
        const item = record(value);
        if (!item || item.kind !== "husnummer" || !isUuid(item.id) || typeof item.label !== "string" ||
          typeof item.streetName !== "string" || typeof item.houseNumber !== "string" ||
          item.postalCode !== expected.postalCode || normalize(item.streetName) !== normalize(expected.streetName) ||
          normalize(item.houseNumber) !== normalize(expected.houseNumber) || !sameAddress(expected, item.label)) return [];
        return [item.id.toLowerCase()];
      });
      const ids = [...new Set(exact)];
      if (ids.length !== 1) return unavailable(ids.length > 1 ? "address_ambiguous" : "address_missing");
      addressId = ids[0]!;
    }

    result.addressId = addressId;
    result.sourceUrl = `${ORIGIN}/api/school-district/by-address?id=${encodeURIComponent(addressId)}`;
    const raw = record(await fetchJson<unknown>(result.sourceUrl, REQUEST_OPTIONS));
    const address = record(raw?.address);
    const fullAddress = text(address?.fullAddress);
    if (!raw || !address || !fullAddress || !Array.isArray(raw.matches) || raw.matches.length > 30) return unavailable("invalid_response");
    if (!sameAddress(expected, fullAddress)) return unavailable("address_mismatch");

    const municipalitySlug = slug(address.municipalitySlug);
    const matches: SchoolDistrictMatch[] = [];
    for (const value of raw.matches) {
      const item = record(value);
      const schoolName = text(item?.schoolName);
      if (!item || !schoolName) return unavailable("invalid_response");
      const schoolSlug = slug(item.schoolSlug);
      let firstGrade = grade(item.starttrin);
      let lastGrade = grade(item.sluttrin);
      if (firstGrade !== null && lastGrade !== null && firstGrade > lastGrade) { firstGrade = null; lastGrade = null; }
      matches.push({ schoolName, firstGrade, lastGrade,
        schoolUrl: municipalitySlug && schoolSlug ? `${ORIGIN}/skole/${municipalitySlug}/${schoolSlug}` : null });
    }
    return {
      ...result, status: matches.length ? "available" : "not_found", reason: null,
      address: fullAddress, municipality: text(address.municipalityName), matches,
      confidence: raw.confidence === "high" || raw.confidence === "medium" || raw.confidence === "low" ? raw.confidence : "unknown",
      source: text(raw.source, 100), disclaimer: text(raw.disclaimer, 3000),
    };
  } catch {
    // A failed school source must not fail the listing or expose upstream errors.
    return unavailable("upstream_unavailable");
  }
}

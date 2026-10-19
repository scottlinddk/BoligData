import type { SchoolDistrictMatch, SchoolDistrictResult } from "../../../../../packages/shared/src/types/school-district.js";
import { fetchJson } from "../crawl/http.js";
import { isUuid } from "../http-helpers.js";
import { emptyResult, normalize, record, REQUEST_OPTIONS, sameAddress, text, type SchoolAddress } from "./shared.js";

export const SKOLEDISTRIKT_ORIGIN = "https://skoledistrikt.dk";

const grade = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10 ? value : null;
const slug = (value: unknown) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : null;

/** Uses only a stored DAR Husnummer or a unique exact autocomplete match.
 * The source's response must corroborate street, house number and postcode.
 * Public endpoints and their response shape were checked on 2026-09-28.
 */
export async function lookupSkoledistrikt(expected: SchoolAddress, idLokalid: string | null): Promise<SchoolDistrictResult> {
  const result: SchoolDistrictResult = { ...emptyResult(`${SKOLEDISTRIKT_ORIGIN}/`), provider: "skoledistrikt" };
  const unavailable = (reason: SchoolDistrictResult["reason"]): SchoolDistrictResult => ({ ...result, reason });

  try {
    let addressId = isUuid(idLokalid) ? idLokalid.toLowerCase() : null;
    if (!addressId) {
      const query = new URLSearchParams({ q: `${expected.streetName} ${expected.houseNumber}, ${expected.postalCode}` });
      const suggestions = await fetchJson<unknown>(`${SKOLEDISTRIKT_ORIGIN}/api/address/autocomplete?${query}`, REQUEST_OPTIONS);
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
    result.sourceUrl = `${SKOLEDISTRIKT_ORIGIN}/api/school-district/by-address?id=${encodeURIComponent(addressId)}`;
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
        schoolUrl: municipalitySlug && schoolSlug ? `${SKOLEDISTRIKT_ORIGIN}/skole/${municipalitySlug}/${schoolSlug}` : null });
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

/**
 * WebLager (weblager.dk) is a front end for scanned municipal building case
 * files (byggesagsarkiv). It is not a data source: there is no public API
 * and nothing structured to ingest, so this stays a pure derivation like
 * tinglysning-link.ts and spildevandsplan.ts, an advisory link the advisor
 * follows and then searches by address in WebLager's own search box.
 *
 * Verified by the project owner: only Aalborg,
 * https://weblager.dk/public/municipality/851/45/search/all?addressId=2919076
 * (851 = municipality code, 45 = segment, addressId = WebLager's internal
 * address id). NOT verified: whether the segment is constant or per
 * municipality, so no other municipality is seeded. addressId is not our
 * DAR id and cannot be derived from our data, so it is never appended.
 * weblager.dk was unreachable from the development sandbox, so the URL is
 * unverified live. Add a municipality only after opening it in a browser.
 */
const MUNICIPALITIES: Record<string, { code: string; segment: string }> = {
  Aalborg: { code: "851", segment: "45" },
};

/** Pure lookup, no network call. Exact municipality name match, null when unverified. */
export function buildWeblagerUrl(municipality: string): string | null {
  const entry = Object.hasOwn(MUNICIPALITIES, municipality) ? MUNICIPALITIES[municipality] : undefined;
  return entry ? `https://weblager.dk/public/municipality/${entry.code}/${entry.segment}/search/all` : null;
}

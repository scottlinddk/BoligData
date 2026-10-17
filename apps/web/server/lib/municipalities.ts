/**
 * Municipality code -> name, for the municipalities the advisory link builders know
 * (`buildSpildevandsplanUrl`, `buildWeblagerUrl`), which are keyed by name. The address
 * register returns only the code, so an address picked by id needs this to get the same links
 * a listing gets from Boligsiden's municipality name.
 *
 * Scope is the crawl's default area (Region Nordjylland, postcodes 9000-9900, plus Thisted and
 * Morsø): exactly the municipalities those builders cover. Any other code returns null, and the
 * checklist then shows its "no verified link" text instead of a guessed link.
 *
 * Every code was checked against the address register on 2026-10-17 by looking up real
 * addresses in each municipality and reading the code the register reports for them.
 */
const NAME_BY_CODE: Readonly<Record<string, string>> = {
  "773": "Morsø",
  "787": "Thisted",
  "810": "Brønderslev",
  "813": "Frederikshavn",
  "820": "Vesthimmerland",
  "825": "Læsø",
  "840": "Rebild",
  "846": "Mariagerfjord",
  "849": "Jammerbugt",
  "851": "Aalborg",
  "860": "Hjørring",
};

/** Accepts "0851", "851" or 851. Null for anything that is not a known municipality code. */
export function municipalityNameFromCode(code: string | number | null | undefined): string | null {
  if (code === null || code === undefined) return null;
  const digits = String(code).trim();
  if (!/^\d{3,4}$/.test(digits)) return null;
  const key = String(Number(digits));
  return Object.hasOwn(NAME_BY_CODE, key) ? NAME_BY_CODE[key]! : null;
}

/** For tests: the names this table covers. */
export const KNOWN_MUNICIPALITY_NAMES: readonly string[] = Object.values(NAME_BY_CODE);

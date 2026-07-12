/**
 * Tinglysning.dk (the Danish land register / tingbog) has no open API, so
 * the encumbrance checklist item can't be automated into a real true/false.
 * The site's own search ("Forespørg uden log ind") is an interactive SPA
 * keyed on street/house number/postal code entered by the user — it does
 * not accept matrikelnr/ejerlav (or anything else) as prefilling query
 * parameters, so we can't deep-link straight to a result. Point at the
 * site's real, working entry point instead of a guessed URL that 404s, and
 * let the due-diligence UI tell the advisor to search by address there.
 */
export function buildTinglysningUrl(matrikelnr: string | null, ejerlav: string | null): string | null {
  if (!matrikelnr || !ejerlav) return null;
  return "https://www.tinglysning.dk/";
}

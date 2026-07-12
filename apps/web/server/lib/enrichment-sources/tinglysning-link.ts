/**
 * Tinglysning.dk (the Danish land register / tingbog) has no open API, so
 * the encumbrance checklist item can't be automated into a real true/false.
 * Instead, build a deep link into tinglysning.dk's search form pre-filled
 * with the property's matrikelnr/ejerlav, so an advisor can pull the actual
 * tingbogsattest themselves. The exact query parameter names below are a
 * best guess at a pre-filled search link — verify against tinglysning.dk's
 * live search form before relying on it to land on the right result.
 */
export function buildTinglysningUrl(matrikelnr: string | null, ejerlav: string | null): string | null {
  if (!matrikelnr || !ejerlav) return null;
  const params = new URLSearchParams({ matrikelnummer: matrikelnr, ejerlavsnavn: ejerlav });
  return `https://www.tinglysning.dk/soeg/tingbog?${params}`;
}

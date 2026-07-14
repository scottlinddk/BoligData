/**
 * Danmarks Miljøportal's jordforureningsattest (soil contamination
 * certificate) report at jord.miljoeportal.dk accepts the cadastral parcel
 * directly as query parameters — `elav` (ejerlavskode, the numeric ejerlav
 * code) and `matrnr` (matrikelnummer) — e.g.
 * https://jord.miljoeportal.dk/report/?elav=620551&matrnr=9h
 * Pure derivation, no network call — mirrors buildTinglysningUrl's shape.
 * Note this needs the numeric ejerlav *code*, not the ejerlav name.
 */
export function buildJordforureningsattestUrl(ejerlavskode: string | null, matrikelnr: string | null): string | null {
  if (!ejerlavskode || !matrikelnr) return null;
  const params = new URLSearchParams({ elav: ejerlavskode, matrnr: matrikelnr });
  return `https://jord.miljoeportal.dk/report/?${params}`;
}

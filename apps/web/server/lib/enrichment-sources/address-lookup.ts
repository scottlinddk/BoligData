import { fetchJson } from "../crawl/http.js";
import { asFiniteNumber, asNonEmptyString, isDanishCoordinate } from "../crawl/map-utils.js";
import { hashSeed, mockModeEnabled, sourceFailed, sourceOk, type SourceResult } from "./types.js";

const MOCK_FLAG = "ADDRESS_LOOKUP_MOCK_MODE";

/**
 * Free-text Danish address -> DAR identifiers, cadastral parcel, zone status
 * and coordinates, via Dataforsyningen's address API (DAWA) at
 * https://api.dataforsyningen.dk/adgangsadresser. Open data, no credential
 * required — which is why this is the one source in the pipeline that returns
 * real data on a deployment with no Datafordeler key configured at all.
 *
 * The returned `id` is the DAR *husnummer* UUID (DAWA's adgangsadresser are
 * DAR husnumre), so it is exactly the key `lookupBbr` needs to reach BBR's
 * Bygning entities on Datafordeler — no second resolution step.
 *
 * Sunset: DAWA closes 2026-08-17. `ADDRESS_LOOKUP_API_BASE` exists so the
 * base can be repointed at a drop-in replacement without a code change; the
 * successor (Datafordeler DAR GraphQL) has no equivalent fuzzy free-text
 * search, so a replacement for `q=` has to be chosen deliberately rather than
 * swapped in silently.
 */
const DEFAULT_API_BASE = "https://api.dataforsyningen.dk/adgangsadresser";
const DEFAULT_PARCEL_API_BASE = "https://api.dataforsyningen.dk/jordstykker";

const ZONES = ["byzone", "landzone", "sommerhusomraade"] as const;

export interface AddressCadastral {
  /** DAR husnummer UUID — the join key into BBR. */
  idLokalid: string | null;
  matrikelnr: string | null;
  ejerlav: string | null;
  /** Numeric ejerlav code (e.g. "620551") — jord.miljoeportal.dk's attest link keys off this, not the ejerlav name. */
  ejerlavskode: string | null;
  /** BFE (Bestemt Fast Ejendom) number of the parcel — the key VUR indexes valuations by. Resolved from the linked `jordstykker` record. */
  bfeNummer: string | null;
  /** Retired upstream: DAWA answers "Udfaset" for every address, so this is null in practice. See `normalizeZone`. */
  zone: (typeof ZONES)[number] | null;
  /** Register coordinates of the access point (WGS84). Lets callers geocode from an address alone. */
  lat: number | null;
  lon: number | null;
  postalCode: string | null;
  postalName: string | null;
  municipalityCode: string | null;
  /** The address as the register spells it, e.g. "Floravej 6, 9000 Aalborg". */
  formattedAddress: string | null;
}

function apiBase(): string {
  return process.env.ADDRESS_LOOKUP_API_BASE?.trim() || DEFAULT_API_BASE;
}

function parcelApiBase(): string {
  return process.env.ADDRESS_LOOKUP_PARCEL_API_BASE?.trim() || DEFAULT_PARCEL_API_BASE;
}

/** Appends the optional Dataforsyningen token to a URL that may already carry a query string. */
function withToken(url: string): string {
  const token = process.env.DATAFORSYNINGEN_TOKEN?.trim();
  if (!token) return url;
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Codes and numbers come back both ways across DAWA's structures — normalize to string. */
function asCodeString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return asNonEmptyString(value);
}

/**
 * DAWA spells zone status in Danish title case ("Byzone", "Landzone",
 * "Sommerhusområde") and some structures return the numeric code instead
 * (1/2/3). Both normalize onto the repo's ASCII `ZoneStatus` union — a plain
 * `includes()` against the raw value silently yields null for every real
 * response.
 *
 * As of 2026 DAWA answers `"Udfaset"` ("phased out") for every address: the
 * zone field is retired, not merely absent for some addresses. It maps to
 * null like any other unrecognized value, but it is called out here because
 * it means byzone/landzone/sommerhusområde now needs a different source
 * (Plandata's zonekort WFS) rather than a fix to this mapping.
 */
function normalizeZone(value: unknown): AddressCadastral["zone"] {
  const numeric = typeof value === "number" ? value : null;
  if (numeric !== null) {
    return numeric === 1 ? "byzone" : numeric === 2 ? "sommerhusomraade" : numeric === 3 ? "landzone" : null;
  }
  const raw = asNonEmptyString(value);
  if (raw === null) return null;
  const folded = raw
    .toLowerCase()
    .replace(/å/g, "aa")
    .replace(/ø/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z]/g, "");
  return (ZONES as readonly string[]).includes(folded) ? (folded as AddressCadastral["zone"]) : null;
}

function mockCadastral(address: string, postalCode: string | null): AddressCadastral {
  const seed = hashSeed(`${address}|${postalCode ?? ""}`);
  return {
    idLokalid: `mock-${seed.toString(16)}`,
    matrikelnr: `${(seed % 900) + 1}${String.fromCharCode(97 + (seed % 26))}`,
    ejerlav: `Mock Ejerlav ${(seed % 50) + 1}`,
    ejerlavskode: String(100000 + (seed % 900000)),
    bfeNummer: String(1_000_000 + (seed % 8_000_000)),
    zone: ZONES[seed % ZONES.length]!,
    lat: 57.0 + (seed % 1000) / 10_000,
    lon: 9.9 + (seed % 1000) / 10_000,
    postalCode,
    postalName: null,
    municipalityCode: null,
    formattedAddress: address,
  };
}

/**
 * Maps one DAWA adgangsadresse record. Cadastral fields moved from the
 * top level of the record into a nested `jordstykke` object in later DAWA
 * versions, and both spellings are still served depending on `struktur`, so
 * each field reads the nested form first and falls back to the flat one.
 */
export function parseAdgangsadresse(raw: unknown): AddressCadastral | null {
  const record = asRecord(raw);
  if (record === null) return null;

  const jordstykke = asRecord(record.jordstykke);
  const ejerlav = asRecord(jordstykke?.ejerlav) ?? asRecord(record.ejerlav);
  const postnummer = asRecord(record.postnummer);
  const kommune = asRecord(record.kommune);
  const vejstykke = asRecord(record.vejstykke);

  const koordinater = asRecord(record.adgangspunkt)?.koordinater;
  // DAWA orders coordinates [longitude, latitude] (GeoJSON convention), the
  // opposite of how they are named everywhere else in this repo.
  const lon = Array.isArray(koordinater) ? asFiniteNumber(koordinater[0]) : null;
  const lat = Array.isArray(koordinater) ? asFiniteNumber(koordinater[1]) : null;
  const hasCoordinates = lat !== null && lon !== null && isDanishCoordinate(lat, lon);

  const postalCode = asCodeString(postnummer?.nr) ?? asCodeString(record.postnr);
  const postalName = asNonEmptyString(postnummer?.navn) ?? asNonEmptyString(record.postnrnavn);
  const streetName = asNonEmptyString(vejstykke?.navn) ?? asNonEmptyString(record.vejnavn);
  const houseNumber = asNonEmptyString(record.husnr);

  const composed =
    streetName !== null
      ? [`${streetName}${houseNumber !== null ? ` ${houseNumber}` : ""}`, [postalCode, postalName].filter(Boolean).join(" ")]
          .filter((part) => part !== "")
          .join(", ")
      : null;

  return {
    idLokalid: asNonEmptyString(record.id),
    matrikelnr: asNonEmptyString(jordstykke?.matrikelnr) ?? asNonEmptyString(record.matrikelnr),
    ejerlav: asNonEmptyString(ejerlav?.navn) ?? asNonEmptyString(record.ejerlavnavn),
    ejerlavskode: asCodeString(ejerlav?.kode) ?? asCodeString(record.ejerlavkode),
    bfeNummer: asCodeString(jordstykke?.bfenummer) ?? asCodeString(record.bfenummer),
    zone: normalizeZone(record.zone),
    lat: hasCoordinates ? lat : null,
    lon: hasCoordinates ? lon : null,
    postalCode,
    postalName,
    municipalityCode: asCodeString(kommune?.kode) ?? asCodeString(record.kommunekode),
    formattedAddress: asNonEmptyString(record.betegnelse) ?? asNonEmptyString(record.adressebetegnelse) ?? composed,
  };
}

/**
 * The adgangsadresse's `jordstykke` object carries only href/ejerlav/
 * matrikelnr/esrejendomsnr — no BFE number. DAWA's separate `jordstykker`
 * resource does carry one, and the address record links straight to it, so
 * the BFE number costs one extra request rather than a second search.
 */
export function parcelUrl(raw: unknown): string | null {
  const record = asRecord(raw);
  const jordstykke = asRecord(record?.jordstykke);
  const href = asNonEmptyString(jordstykke?.href);
  if (href !== null) return href;

  const ejerlavskode = asCodeString(asRecord(jordstykke?.ejerlav)?.kode) ?? asCodeString(record?.ejerlavkode);
  const matrikelnr = asNonEmptyString(jordstykke?.matrikelnr) ?? asNonEmptyString(record?.matrikelnr);
  if (ejerlavskode === null || matrikelnr === null) return null;
  return `${parcelApiBase()}/${encodeURIComponent(ejerlavskode)}/${encodeURIComponent(matrikelnr)}`;
}

/**
 * Fetches the parcel's BFE number — the key VUR indexes valuations by.
 * Failure-isolated on purpose: this is supplementary, and a parcel lookup
 * erroring must not cost the caller an otherwise good address resolution.
 */
async function fetchBfeNummer(url: string | null): Promise<string | null> {
  if (url === null) return null;
  try {
    const parcel = asRecord(await fetchJson<unknown>(withToken(url)));
    return parcel === null ? null : asCodeString(parcel.bfenummer);
  } catch {
    return null;
  }
}

async function search(address: string, postalCode: string | null, fuzzy: boolean): Promise<unknown[]> {
  const params = new URLSearchParams({ q: address, per_side: "1", side: "1" });
  if (postalCode) params.set("postnr", postalCode);
  // DAWA reads `fuzzy` as a presence flag, so it must only be appended on the
  // retry — sending `fuzzy=false` still enables fuzzy matching.
  if (fuzzy) params.set("fuzzy", "");

  const results = await fetchJson<unknown>(withToken(`${apiBase()}?${params}`));
  return Array.isArray(results) ? results : [];
}

/**
 * Looks up the DAR husnummer UUID plus cadastral parcel (matrikelnr/ejerlav/
 * BFE) and coordinates for one free-text address. Zone status comes back null:
 * DAWA has retired that field (see `normalizeZone`).
 *
 * `lat`/`lon` are inputs *and* outputs: callers that already know the
 * coordinates pass them so an address that DAWA can't parse still yields
 * something usable, and callers that don't get the register's own access
 * point back. Only fails outright when the address matched nothing.
 */
export async function lookupAddressCadastral(
  address: string,
  postalCode: string | null,
  lat = 0,
  lon = 0,
): Promise<SourceResult<AddressCadastral>> {
  if (mockModeEnabled(MOCK_FLAG)) return sourceOk(mockCadastral(address, postalCode));

  const fallbackLat = isDanishCoordinate(lat, lon) ? lat : null;
  const fallbackLon = isDanishCoordinate(lat, lon) ? lon : null;

  try {
    // Exact search first: DAWA's `q` is already case-insensitive and matches
    // across vejnavn/husnr/postnr, so fuzzy is only worth the extra call when
    // the address text is genuinely misspelled.
    let results = await search(address, postalCode, false);
    if (results.length === 0) results = await search(address, postalCode, true);

    const match = results[0];
    const parsed = results.length > 0 ? parseAdgangsadresse(match) : null;
    if (parsed === null || parsed.idLokalid === null) {
      return sourceFailed(`no address match for "${address}"${postalCode ? ` (${postalCode})` : ""}`);
    }

    return sourceOk({
      ...parsed,
      bfeNummer: parsed.bfeNummer ?? (await fetchBfeNummer(parcelUrl(match))),
      lat: parsed.lat ?? fallbackLat,
      lon: parsed.lon ?? fallbackLon,
      postalCode: parsed.postalCode ?? postalCode,
    });
  } catch (err) {
    return sourceFailed(err);
  }
}

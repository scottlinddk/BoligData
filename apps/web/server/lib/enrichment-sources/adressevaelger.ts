import { fetchJson } from "../crawl/http.js";
import { asFiniteNumber, asNonEmptyString, isDanishCoordinate } from "../crawl/map-utils.js";
import { etrs89Utm32ToWgs84 } from "../geo/etrs89-utm32.js";
import { sourceFailed, sourceOk, type SourceResult } from "./types.js";
import type { AddressCadastral } from "./address-lookup.js";

/**
 * Husnummer (DAR access address) id -> identity, postal code and coordinates,
 * via Klimadatastyrelsen's Adressevælger (https://adressevaelger.dk), the
 * replacement for DAWA, which closed 2026-10-01 and answers `410 Gone`.
 *
 * Unlike DAWA's `q=` search this takes the *id* a user already picked from the
 * Adressevælger autocomplete, so there is no fuzzy matching to get wrong: the
 * id is the DAR husnummer UUID that `lookupBbr` keys off directly.
 *
 * Open and free. The API currently has no user management; it only requires a
 * `token` of at least 10 arbitrary characters, and KDS recommends the shared
 * default below so that the move to real accounts is a one-line change.
 *
 * Scope, deliberately narrower than DAWA: identity, municipality, postal code
 * and the access point's coordinates. The cadastral parcel (`matrikelnr`,
 * `ejerlav`, `bfeNummer`) is a Matriklen concern that this register does not
 * carry, so those stay `null` instead of being guessed.
 */
const DEFAULT_API_BASE = "https://adressevaelger.dk";
const DEFAULT_TOKEN = "adressevaelger123";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isHusnummerId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function apiBase(): string {
  return (process.env.ADRESSEVAELGER_API_BASE?.trim() || DEFAULT_API_BASE).replace(/\/+$/, "");
}

function token(): string {
  return process.env.ADRESSEVAELGER_TOKEN?.trim() || DEFAULT_TOKEN;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Maps an Adressevælger `/husnumre/{id}` body onto the cadastral shape the lookup pipeline consumes. */
export function parseHusnummer(raw: unknown): AddressCadastral | null {
  const root = asRecord(raw);
  const husnummer = asRecord(root?.husnummer);
  if (husnummer === null) return null;

  const idLokalid = asNonEmptyString(husnummer.id_lokalid);
  if (idLokalid === null) return null;

  const point = asRecord(asRecord(husnummer.adgangspunkt)?.koordinater);
  const easting = asFiniteNumber(point?.x);
  const northing = asFiniteNumber(point?.y);
  const wgs84 = easting !== null && northing !== null ? etrs89Utm32ToWgs84(easting, northing) : null;
  const hasCoordinates = wgs84 !== null && isDanishCoordinate(wgs84.lat, wgs84.lon);

  const postnummer = asRecord(husnummer.postnummer);

  return {
    idLokalid,
    matrikelnr: null,
    ejerlav: null,
    ejerlavskode: null,
    bfeNummer: null,
    zone: null,
    lat: hasCoordinates ? wgs84.lat : null,
    lon: hasCoordinates ? wgs84.lon : null,
    postalCode: asNonEmptyString(postnummer?.postnr),
    postalName: asNonEmptyString(postnummer?.navn),
    municipalityCode: asNonEmptyString(asRecord(husnummer.navngivenvejkommunedel)?.kommune),
    formattedAddress: asNonEmptyString(husnummer.adgangsadressebetegnelse),
    streetName: asNonEmptyString(husnummer.vejnavn),
    houseNumber: asNonEmptyString(husnummer.husnummertekst),
    resolvedVia: "adressevaelger",
  };
}

export async function lookupHusnummerById(id: string): Promise<SourceResult<AddressCadastral>> {
  if (!isHusnummerId(id)) return sourceFailed("husnummer id is not a valid UUID");
  try {
    const body = await fetchJson<unknown>(
      `${apiBase()}/husnumre/${encodeURIComponent(id)}?token=${encodeURIComponent(token())}`,
    );
    const parsed = parseHusnummer(body);
    return parsed === null ? sourceFailed("Adressevælger returned no husnummer for this id") : sourceOk(parsed);
  } catch (error) {
    return sourceFailed(error);
  }
}

const normalize = (value: string): string => value.normalize("NFC").toLocaleLowerCase("da-DK").replace(/\s+/g, " ").trim();

/**
 * The one husnummer id a search answered for exactly this street, house number and (when known) postcode,
 * or null. A hit on another number, another street or another town is never taken, and two equally exact
 * hits (the same street name in two towns, with no postcode to tell them apart) are refused as ambiguous.
 */
export function pickExactHusnummer(
  body: unknown,
  wanted: { streetName: string; houseNumber: string; postalCode: string | null },
): string | null {
  const hits = asRecord(body)?.fund;
  if (!Array.isArray(hits)) return null;
  const ids = new Set<string>();
  for (const hit of hits) {
    const record = asRecord(hit);
    if (!record || record.type !== "husnummer" || !isHusnummerId(record.id)) continue;
    if (typeof record.vejnavn !== "string" || typeof record.husnummer !== "string") continue;
    if (normalize(record.vejnavn) !== normalize(wanted.streetName) || normalize(record.husnummer) !== normalize(wanted.houseNumber)) continue;
    // The title reads "Vej 1, 9000 By"; the postcode is the token after the first comma.
    const titlePostcode = typeof record.titel === "string" ? /,\s*(\d{4})\b/.exec(record.titel)?.[1] ?? null : null;
    if (wanted.postalCode !== null && titlePostcode !== wanted.postalCode) continue;
    ids.add(record.id);
  }
  return ids.size === 1 ? [...ids][0]! : null;
}

/**
 * Free-text address ("Vej 12B, 9000 Aalborg") -> the husnummer, through Adressevælger's search and then its
 * `/husnumre/{id}` record. This is the keyless path for listings (and for those DAR cannot match): the search is the one open,
 * keyless register search left, and only an exact match is accepted (see `pickExactHusnummer`).
 */
export async function searchHusnummerByAddress(
  wanted: { streetName: string; houseNumber: string; postalCode: string | null },
): Promise<SourceResult<AddressCadastral>> {
  const text = `${wanted.streetName} ${wanted.houseNumber}${wanted.postalCode ? `, ${wanted.postalCode}` : ""}`;
  const params = new URLSearchParams({ tekst: text.slice(0, 73), maksimum: "10", token: token() });
  try {
    const body = await fetchJson<unknown>(`${apiBase()}/husnumre/soeg?${params}`);
    const id = pickExactHusnummer(body, wanted);
    if (id === null) return sourceFailed(`Adressevælger: no single exact match for "${text}"`);
    return await lookupHusnummerById(id);
  } catch (error) {
    return sourceFailed(error);
  }
}

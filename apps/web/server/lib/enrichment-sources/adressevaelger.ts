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

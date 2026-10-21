import { asFiniteNumber, asNonEmptyString, isDanishCoordinate } from "../crawl/map-utils.js";
import { etrs89Utm32ToWgs84 } from "../geo/etrs89-utm32.js";
import { DAR_SERVICE } from "./bbr.js";
import { postGraphQl } from "./datafordeler.js";
import { sourceFailed, sourceOk, type SourceResult } from "./types.js";
import type { AddressCadastral } from "./address-lookup.js";

/**
 * Fallback address resolver for when DAWA (`address-lookup.ts`'s primary
 * path) is unreachable. DAWA closed on 2026-10-01 and answers HTTP 410, so in
 * practice this is now the keyed path whenever Adressevælger has no answer.
 * Queries Datafordeler's DAR GraphQL service, reusing the `postGraphQl` client
 * (version walk, `apiKey` handling) that `bbr.ts` already relies on.
 *
 * The query shape follows what the live DAR service accepts (verified against
 * it on 2026-10-01 by the public `datafordeler-dar-mcp` project; it differs
 * from Datafordeler's published transition guide):
 *
 * - Every entity query carries `virkningstid` AND `registreringstid` set to
 *   now. With only one of them, superseded registrations come back too.
 * - There is no street-name filter on `DAR_Husnummer`. The only text filter is
 *   `adgangsadressebetegnelse: { startsWith }` ("Vejnavn 12, 9000 By"), which
 *   is case-sensitive. A trailing comma after the house number keeps "33" from
 *   also matching "330".
 * - References are UUIDs, not nested objects: `adgangspunkt` is the id of a
 *   `DAR_Adressepunkt`, whose `position { wkt crs }` holds the coordinates
 *   (EPSG:25832 unless `crs` says otherwise).
 *
 * Scope, deliberately narrower than DAWA: this resolves address *identity*
 * and *geocoding* (`idLokalid`, coordinates, postal code) — enough to unblock
 * BBR, VUR and the noise/sales lookups, which all key off the husnummer UUID
 * or coordinates — but not the cadastral parcel (`matrikelnr`/`ejerlav`/
 * `bfeNummer`/`zone`) or the municipality code, which the husnummer only
 * references by id. Those stay `null` rather than guessed.
 */
const HUSNUMMER_TYPE = "DAR_Husnummer";
const ADRESSEPUNKT_TYPE = "DAR_Adressepunkt";
/** DAR status 3 = gældende (current). */
const STATUS_CURRENT = "3";
const MAX_CANDIDATES = 25;

export interface StructuredAddress {
  streetName: string;
  houseNumber: string;
  postalCode: string | null;
}

/**
 * Splits a free-text Danish address into the components the register lookups
 * key on: "Hobrovej 123, 9000 Aalborg" -> street "Hobrovej", house number
 * "123", postal code "9000". Floor/door suffixes ("2. tv") are dropped,
 * since a husnummer identifies the entrance, not the unit. A letter may be
 * glued on ("6a"), spaced ("10 B") or written with a plus as Boligsiden does
 * for some entrances ("10+B"); all normalise to "10B". Returns null when the
 * first comma-separated segment doesn't end in a house-number-shaped token.
 */
export function parseStructuredAddress(address: string, postalCodeHint: string | null): StructuredAddress | null {
  const firstPart = address.split(",")[0]?.trim() ?? "";
  const match = /^(.+?)\s+(\d+)\s*\+?\s*([a-zA-Z]?)$/.exec(firstPart);
  if (!match) return null;

  const streetName = match[1]!.trim();
  const houseNumber = `${match[2]!}${match[3]!}`;
  if (streetName === "") return null;

  const postalMatch = /\b(\d{4})\b/.exec(address);
  const postalCode = postalCodeHint ?? (postalMatch ? postalMatch[1]! : null);

  return { streetName, houseNumber, postalCode };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asRecordList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(asRecord).filter((v): v is Record<string, unknown> => v !== null);
  const single = asRecord(value);
  return single === null ? [] : [single];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** DAR writes "Vejnavn 12, [Bynavn,] 9000 By"; the postcode is the 4 digits before the town name. */
function postalCodeOf(designation: string): string | null {
  return /(?:^|,\s*)(\d{4})\s+[^,]+$/.exec(designation)?.[1] ?? null;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("da-DK");
}

function upperFirst(value: string): string {
  return value.charAt(0).toLocaleUpperCase("da-DK") + value.slice(1);
}

function bitemporal(now: string): string {
  return `virkningstid: ${JSON.stringify(now)}, registreringstid: ${JSON.stringify(now)}`;
}

function buildHusnummerQuery(structured: StructuredAddress, now: string): string {
  const prefix = `${upperFirst(structured.streetName)} ${structured.houseNumber},`;
  return `query HusnummerLookup {
  ${HUSNUMMER_TYPE}(first: ${MAX_CANDIDATES}, ${bitemporal(now)}, where: { adgangsadressebetegnelse: { startsWith: ${JSON.stringify(prefix)} }, status: { eq: ${JSON.stringify(STATUS_CURRENT)} } }) {
    nodes {
      id_lokalId
      adgangsadressebetegnelse
      husnummertekst
      adgangspunkt
    }
  }
}`;
}

function buildAdressepunktQuery(id: string, now: string): string {
  return `query AdressepunktLookup {
  ${ADRESSEPUNKT_TYPE}(first: 1, ${bitemporal(now)}, where: { id_lokalId: { eq: ${JSON.stringify(id)} } }) {
    nodes {
      id_lokalId
      position { wkt crs }
    }
  }
}`;
}

/**
 * Picks the one current husnummer that is exactly this street + number (+ postcode).
 * The `startsWith` prefix is case-sensitive but otherwise loose (it also matches
 * other towns that share the street name), so the match is re-checked here.
 * Null when nothing matches or the answer is ambiguous.
 */
function selectHusnummer(nodes: Record<string, unknown>[], structured: StructuredAddress): Record<string, unknown> | null {
  const wanted = `${normalize(structured.streetName)} ${normalize(structured.houseNumber)},`;
  const matches = nodes.filter((node) => {
    const designation = asNonEmptyString(node.adgangsadressebetegnelse);
    if (designation === null || !normalize(designation).startsWith(wanted)) return false;
    return structured.postalCode === null || postalCodeOf(designation) === structured.postalCode;
  });
  const distinct = new Set(matches.map((node) => asNonEmptyString(node.id_lokalId)));
  return distinct.size === 1 ? matches[0]! : null;
}

/** Parses "POINT (x y)" / "POINT Z (x y z)" into [x, y]. */
function pointOf(wkt: unknown): [number, number] | null {
  const match = typeof wkt === "string" ? /POINT\s*Z?\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)/i.exec(wkt) : null;
  if (!match) return null;
  const x = asFiniteNumber(Number(match[1]));
  const y = asFiniteNumber(Number(match[2]));
  return x === null || y === null ? null : [x, y];
}

function wgs84Of(position: Record<string, unknown> | null): { lat: number; lon: number } | null {
  const point = pointOf(position?.wkt);
  if (point === null) return null;
  const crs = String(position?.crs ?? "").match(/\d+$/)?.[0];
  const coordinate = crs === "4326" ? { lat: point[1], lon: point[0] } : etrs89Utm32ToWgs84(point[0], point[1]);
  return coordinate !== null && isDanishCoordinate(coordinate.lat, coordinate.lon) ? coordinate : null;
}

/**
 * Resolves one free-text address via Datafordeler's DAR GraphQL service. See
 * the module doc for scope (identity + geocoding only, no cadastral parcel).
 * A missing or unreadable access point still returns the identity, with the
 * coordinates null, since the husnummer UUID is what BBR keys off.
 */
export async function lookupAddressCadastralViaDar(
  address: string,
  postalCode: string | null,
  apiKey: string,
): Promise<SourceResult<AddressCadastral>> {
  const structured = parseStructuredAddress(address, postalCode);
  if (structured === null) {
    return sourceFailed(`could not parse "${address}" into street + house number for the DAR fallback`);
  }

  const now = new Date().toISOString();
  try {
    const husnumre = await postGraphQl<Record<string, { nodes?: unknown } | null | undefined>>(
      DAR_SERVICE, apiKey, buildHusnummerQuery(structured, now),
    );
    const node = selectHusnummer(asRecordList(husnumre?.[HUSNUMMER_TYPE]?.nodes), structured);
    const idLokalid = node === null ? null : asNonEmptyString(node.id_lokalId);
    if (node === null || idLokalid === null) {
      return sourceFailed(`no unique DAR husnummer match for "${address}"${structured.postalCode ? ` (${structured.postalCode})` : ""}`);
    }

    let coordinate: { lat: number; lon: number } | null = null;
    const adgangspunkt = asNonEmptyString(node.adgangspunkt);
    if (adgangspunkt !== null && UUID.test(adgangspunkt)) {
      const punkter = await postGraphQl<Record<string, { nodes?: unknown } | null | undefined>>(
        DAR_SERVICE, apiKey, buildAdressepunktQuery(adgangspunkt, now),
      );
      coordinate = wgs84Of(asRecord(asRecordList(punkter?.[ADRESSEPUNKT_TYPE]?.nodes)[0]?.position));
    }

    const resolvedPostalCode = postalCodeOf(asNonEmptyString(node.adgangsadressebetegnelse) ?? "") ?? structured.postalCode;
    return sourceOk({
      idLokalid,
      matrikelnr: null,
      ejerlav: null,
      ejerlavskode: null,
      bfeNummer: null,
      zone: null,
      lat: coordinate?.lat ?? null,
      lon: coordinate?.lon ?? null,
      postalCode: resolvedPostalCode,
      postalName: null,
      municipalityCode: null,
      formattedAddress: asNonEmptyString(node.adgangsadressebetegnelse) ?? `${structured.streetName} ${structured.houseNumber}`,
      resolvedVia: "dar_fallback",
    });
  } catch (err) {
    return sourceFailed(err);
  }
}

import { asFiniteNumber, asNonEmptyString, isDanishCoordinate } from "../crawl/map-utils.js";
import { DAR_SERVICE } from "./bbr.js";
import { entityFields, GraphQlError, pickField, postGraphQl } from "./datafordeler.js";
import { sourceFailed, sourceOk, type SourceResult } from "./types.js";
import type { AddressCadastral } from "./address-lookup.js";

/**
 * Fallback address resolver for when DAWA (`address-lookup.ts`'s primary
 * path) is unreachable — which, per DAWA's own announced sunset
 * (2026-08-17, already past as of this writing), is no longer a remote
 * possibility. Queries Datafordeler's DAR GraphQL service directly, reusing
 * the same GraphQL client, version-walking and schema-introspection helpers
 * (`datafordeler.ts`) that `bbr.ts` already relies on for its DAR->BBR
 * traversal, and the same `DAR_SERVICE` endpoint definition.
 *
 * DAR has no fuzzy free-text search equivalent to DAWA's `q=`, so this
 * parses the address into structured components first (see
 * `parseStructuredAddress`) and filters DAR's `Husnummer` entity by them.
 *
 * Scope, deliberately narrower than DAWA: this resolves address *identity*
 * and *geocoding* (`idLokalid`, coordinates, postal code, municipality code)
 * — enough to unblock BBR, VUR and the noise/sales lookups, which all key off
 * the husnummer UUID or coordinates — but not the cadastral parcel
 * (`matrikelnr`/`ejerlav`/`bfeNummer`/`zone`). Resolving those from DAR alone
 * would need a spatial join against Matriklen's parcel geometry, which is a
 * separately-scoped piece of work; returning them as `null` here follows this
 * repo's existing rule (`sourceFailed`/null over a fabricated or unverifiable
 * join) rather than guessing.
 *
 * Field names below are guessed from Datafordeler's published DAR data
 * model, not verified against a live schema — this sandbox has no network
 * egress to `datafordeler.dk`. `husnummerSchema` narrows the guesses to
 * whatever the live schema actually defines when introspection is available,
 * the same safety net `bbr.ts` uses.
 */
const HUSNUMMER_TYPE = "DAR_Husnummer";

const STREET_FIELD_CANDIDATES = ["adresseringsvejnavn", "vejnavn"];
const HOUSE_NUMBER_FIELD_CANDIDATES = ["husnummertekst", "husnr"];
const POSTNR_FIELD_CANDIDATES = ["postnr", "postnummer"];
const MUNICIPALITY_FIELD_CANDIDATES = ["kommunekode", "kommune"];
const COORDINATE_FIELD = "adgangspunkt";

export interface StructuredAddress {
  streetName: string;
  houseNumber: string;
  postalCode: string | null;
}

/**
 * Splits a free-text Danish address into the components DAR's GraphQL
 * service can filter on: "Hobrovej 123, 9000 Aalborg" -> street "Hobrovej",
 * house number "123", postal code "9000". Floor/door suffixes ("2. tv") are
 * dropped — Husnummer identifies the building entrance, not the unit.
 * Returns null when the first comma-separated segment doesn't end in a
 * house-number-shaped token, which this can't turn into a useful filter.
 */
export function parseStructuredAddress(address: string, postalCodeHint: string | null): StructuredAddress | null {
  const firstPart = address.split(",")[0]?.trim() ?? "";
  const match = /^(.+?)\s+(\d+[a-zA-Z]?)$/.exec(firstPart);
  if (!match) return null;

  const streetName = match[1]!.trim();
  const houseNumber = match[2]!;
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

async function husnummerSchema(apiKey: string): Promise<Set<string> | null> {
  try {
    return await entityFields(DAR_SERVICE, apiKey, HUSNUMMER_TYPE);
  } catch {
    // Best-effort: a wrong guess below still costs only this attempt, not the
    // whole fallback (see the GraphQlError handling in the caller).
    return null;
  }
}

/** The schema's spelling for a candidate list, or the first candidate as a best guess when the schema is unknown. */
function resolveField(schema: Set<string> | null, candidates: string[]): string {
  if (schema === null) return candidates[0]!;
  return pickField(schema, ...candidates) ?? candidates[0]!;
}

interface ResolvedFields {
  street: string;
  houseNumber: string;
  postnr: string | null;
  municipality: string | null;
}

function buildHusnummerQuery(fields: ResolvedFields, structured: StructuredAddress): string {
  const clauses = [
    `${fields.street}: { eq: ${JSON.stringify(structured.streetName)} }`,
    `${fields.houseNumber}: { eq: ${JSON.stringify(structured.houseNumber)} }`,
  ];
  if (fields.postnr !== null && structured.postalCode !== null) {
    clauses.push(`${fields.postnr}: { eq: ${JSON.stringify(structured.postalCode)} }`);
  }

  const selection = [
    "id_lokalId",
    fields.houseNumber,
    fields.postnr,
    fields.municipality,
    `${COORDINATE_FIELD} { koordinater }`,
  ].filter((field): field is string => field !== null);

  return `query HusnummerLookup {
  ${HUSNUMMER_TYPE}(where: { ${clauses.join("\n    ")} }) {
    nodes {
      ${selection.join("\n      ")}
    }
  }
}`;
}

function mapHusnummer(node: Record<string, unknown>, fields: ResolvedFields, structured: StructuredAddress): AddressCadastral {
  const koordinater = asRecord(node[COORDINATE_FIELD])?.koordinater;
  // Same convention as DAWA: [longitude, latitude].
  const lon = Array.isArray(koordinater) ? asFiniteNumber(koordinater[0]) : null;
  const lat = Array.isArray(koordinater) ? asFiniteNumber(koordinater[1]) : null;
  const hasCoordinates = lat !== null && lon !== null && isDanishCoordinate(lat, lon);

  const postalCode =
    (fields.postnr !== null ? asNonEmptyString(node[fields.postnr]) : null) ?? structured.postalCode;

  return {
    idLokalid: asNonEmptyString(node.id_lokalId),
    matrikelnr: null,
    ejerlav: null,
    ejerlavskode: null,
    bfeNummer: null,
    zone: null,
    lat: hasCoordinates ? lat : null,
    lon: hasCoordinates ? lon : null,
    postalCode,
    postalName: null,
    municipalityCode: fields.municipality !== null ? asNonEmptyString(node[fields.municipality]) : null,
    formattedAddress: `${structured.streetName} ${structured.houseNumber}${postalCode ? `, ${postalCode}` : ""}`,
    resolvedVia: "dar_fallback",
  };
}

/**
 * Resolves one free-text address via Datafordeler's DAR GraphQL service,
 * used as a fallback when DAWA is unreachable. See the module doc for scope
 * (identity + geocoding only, no cadastral parcel).
 */
export async function lookupAddressCadastralViaDar(
  address: string,
  postalCode: string | null,
  apiKey: string,
): Promise<SourceResult<AddressCadastral>> {
  const parsed = parseStructuredAddress(address, postalCode);
  if (parsed === null) {
    return sourceFailed(`could not parse "${address}" into street + house number for the DAR fallback`);
  }
  const structured: StructuredAddress = parsed;

  const schema = await husnummerSchema(apiKey);
  const fields: ResolvedFields = {
    street: resolveField(schema, STREET_FIELD_CANDIDATES),
    houseNumber: resolveField(schema, HOUSE_NUMBER_FIELD_CANDIDATES),
    postnr: schema === null ? POSTNR_FIELD_CANDIDATES[0]! : pickField(schema, ...POSTNR_FIELD_CANDIDATES),
    municipality: schema === null ? null : pickField(schema, ...MUNICIPALITY_FIELD_CANDIDATES),
  };

  interface HusnummerResponse {
    [key: string]: { nodes?: unknown } | null | undefined;
  }

  async function run(withPostnrFilter: boolean): Promise<Record<string, unknown> | null> {
    const attemptFields = withPostnrFilter ? fields : { ...fields, postnr: null };
    const query = buildHusnummerQuery(attemptFields, structured);
    const data = await postGraphQl<HusnummerResponse>(DAR_SERVICE, apiKey, query);
    const nodes = asRecordList(data?.[HUSNUMMER_TYPE]?.nodes);
    return nodes[0] ?? null;
  }

  try {
    let node: Record<string, unknown> | null;
    try {
      node = await run(true);
    } catch (err) {
      // The postnr field name (or the filter itself) may not be what was
      // guessed — drop it and retry on the street + house number alone
      // rather than losing the whole lookup to one wrong field.
      if (!(err instanceof GraphQlError)) throw err;
      node = await run(false);
    }

    if (node === null) {
      return sourceFailed(`no DAR husnummer match for "${address}"${postalCode ? ` (${postalCode})` : ""}`);
    }

    const mapped = mapHusnummer(node, fields, structured);
    if (mapped.idLokalid === null) {
      return sourceFailed(`DAR husnummer match for "${address}" had no id_lokalId`);
    }
    return sourceOk(mapped);
  } catch (err) {
    return sourceFailed(err);
  }
}

import { asNonEmptyString, asPositiveInt } from "../crawl/map-utils.js";
import { entityFields, postGraphQl, type DatafordelerService } from "./datafordeler.js";
import { hashSeed, mockModeEnabled, sourceFailed, sourceOk, type SourceResult } from "./types.js";

const MOCK_FLAG = "BBR_MOCK_MODE";

/** Still used by the separate address resolver; BBR does not query DAR. */
export const DAR_SERVICE: DatafordelerService = {
  register: "DAR",
  versionEnv: "DATAFORDELER_DAR_VERSION",
  baseEnv: "DATAFORDELER_DAR_API_BASE",
  versions: ["v3", "v2", "v1"],
};

const BBR_SERVICE: DatafordelerService = {
  register: "BBR",
  versionEnv: "DATAFORDELER_BBR_VERSION",
  baseEnv: "DATAFORDELER_BBR_API_BASE",
  versions: ["v3", "v2", "v1"],
};

/** Direct entity fields/filter verified against the published schema:
 * https://datafordeler.dk/GraphQLSchema/BBR.graphql
 * DAR entity endpoints do not expose cross-register building traversals. */
const BYGNING_TYPE = "BBR_Bygning";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// https://teknik.bbr.dk/kodelister/0/1/0/Livscyklus — 6 = Opført.
const BUILT_STATUS = "6";

const HEATING_TYPES = ["oliefyr", "fjernvarme", "elvarme", "naturgasfyr", "varmepumpe"];
const ROOF_MATERIALS = ["tegl", "fibercement", "built-up-tag", "tagpap", "metalplader"];
const WALL_MATERIALS = ["mursten", "letbeton", "træbeklædning", "betonelementer", "pudset mur"];

export interface BbrBuildingData {
  yearBuilt: number | null;
  renovationYear: number | null;
  /** Always null on the live entrance/building lookup: byg039 is a building
   * total, and the caller has not established the listing's housing unit. */
  areaSqm: number | null;
  /** Raw BBR bygningsanvendelse code (e.g. "120" = fritliggende enfamiliehus). */
  buildingType: string | null;
  floors: number | null;
  /** Raw BBR tagdækningsmateriale code. */
  roofMaterial: string | null;
  /** Raw BBR ydervæggens materiale code. */
  wallMaterial: string | null;
  /**
   * Heating, decoded from BBR's varmeinstallation + opvarmningsmiddel code
   * pair onto this repo's vocabulary ("oliefyr", "fjernvarme", ...) — see
   * `decodeHeating`. Callers compare against `"oliefyr"` for oil-tank risk.
   */
  heatingInstallation: string | null;
  /** Basement area in sqm. Null on the live path until the field name is confirmed against the schema. */
  basementSqm: number | null;
  /** Water-flushing toilet count — lives on BBR's Enhed entity (enh065), not Bygning; null on the live path. */
  toiletCount: number | null;
  /** Bathroom count — lives on BBR's Enhed entity (enh066), not Bygning; null on the live path. */
  bathroomCount: number | null;
}

const IDENTITY_FIELDS = ["id_lokalId", "husnummer", "status", "registreringFra", "registreringTil", "virkningFra", "virkningTil"] as const;

const CORE_FIELDS = [
  "byg021BygningensAnvendelse",
  "byg026Opfoerelsesaar",
] as const;

/** Building-level facts only; no residential-unit area or room count. */
const EXTENDED_FIELDS = [
  ...CORE_FIELDS,
  "byg027OmTilbygningsaar",
  "byg032YdervaeggensMateriale",
  "byg033Tagdaekningsmateriale",
  "byg054AntalEtager",
  "byg056Varmeinstallation",
  "byg057Opvarmningsmiddel",
] as const;

interface BuildingData {
  BBR_Bygning?: { nodes?: unknown; pageInfo?: { hasNextPage?: unknown } | null } | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** BBR codes come back as either numbers or numeric strings depending on the field. */
function asCode(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return asNonEmptyString(value);
}

/**
 * BBR does not store "oliefyr" as such: it stores an installation code
 * (byg056) and, for the central-heating and stove codes, a separate fuel code
 * (byg057). Oil heating is the *pair* — central heating or stoves burning
 * "flydende brændsel" (fuel code 3). Collapsing the pair here keeps the
 * oil-tank risk check in enrich.ts a single string comparison and keeps the
 * mock and live vocabularies identical.
 */
export function decodeHeating(installationCode: string | null, fuelCode: string | null): string | null {
  switch (installationCode) {
    case "1":
      return "fjernvarme";
    case "5":
      return "varmepumpe";
    case "7":
      return "elvarme";
    case "8":
      return "naturgasfyr";
    case "9":
      return "ingen varmeinstallation";
    case null:
      return null;
    case "2":
    case "6":
    case "3":
      break;
    default:
      return null;
  }

  // Central heating (2/6) and stoves (3) — the fuel decides what it actually is.
  switch (fuelCode) {
    case "1":
      return "elvarme";
    case "2":
    case "7":
      return "naturgasfyr";
    case "3":
      return "oliefyr";
    case "4":
    case "6":
      return "fast brændsel";
    default:
      return installationCode === "3" ? "ovne" : "centralvarme";
  }
}

function mockBuildingData(idLokalid: string): BbrBuildingData {
  const seed = hashSeed(idLokalid);
  const yearBuilt = 1890 + (seed % 130);
  return {
    yearBuilt,
    renovationYear: seed % 3 === 0 ? yearBuilt + 20 : null,
    areaSqm: 60 + (seed % 200),
    buildingType: "120",
    floors: 1 + (seed % 3),
    roofMaterial: ROOF_MATERIALS[seed % ROOF_MATERIALS.length]!,
    wallMaterial: WALL_MATERIALS[seed % WALL_MATERIALS.length]!,
    heatingInstallation: HEATING_TYPES[seed % HEATING_TYPES.length]!,
    basementSqm: seed % 2 === 0 ? 20 + (seed % 60) : null,
    toiletCount: 1 + (seed % 3),
    bathroomCount: 1 + (seed % 2),
  };
}

/** Two rows suffice to detect ambiguity. A partial page never proves a
 * unique building. Temporal/identity fields are mandatory on every retry. */
export function buildBygningQuery(husnummer: string, tid: string, fields: readonly string[]): string {
  return `query HusnummerBygning {
  BBR_Bygning(
    registreringstid: ${JSON.stringify(tid)}
    virkningstid: ${JSON.stringify(tid)}
    first: 2
    where: { husnummer: { eq: ${JSON.stringify(husnummer)} }, status: { eq: "${BUILT_STATUS}" } }
  ) {
    pageInfo { hasNextPage }
    nodes {
      ${[...new Set([...IDENTITY_FIELDS, ...fields])].join("\n      ")}
    }
  }
}`;
}

function timestamp(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:[0-5]\d)$/.test(value)) return null;
  const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  const result = Date.parse(value);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value.slice(0, 10) && Number.isFinite(result) ? result : null;
}

function coversNow(from: unknown, to: unknown, now: number): boolean {
  const start = timestamp(from);
  const end = to === null ? null : timestamp(to);
  return start !== null && start <= now && (to === null || (end !== null && now < end));
}

function currentBuilding(data: BuildingData | null, husnummer: string, tid: string): SourceResult<Record<string, unknown>> {
  const connection = data?.BBR_Bygning;
  if (connection?.pageInfo?.hasNextPage !== false || !Array.isArray(connection.nodes)) return sourceFailed("BBR response does not establish a complete building result");
  if (connection.nodes.length === 0) return sourceFailed("no current built BBR building linked to this husnummer");
  if (connection.nodes.length !== 1) return sourceFailed("multiple BBR building records linked to this husnummer; building identity is ambiguous");
  const building = asRecord(connection.nodes[0]);
  const id = asNonEmptyString(building?.id_lokalId);
  if (!building || !id || !UUID.test(id) || typeof building.husnummer !== "string" || building.husnummer.toLowerCase() !== husnummer.toLowerCase()) {
    return sourceFailed("BBR response has missing or mismatched building identity");
  }
  const now = Date.parse(tid);
  if (asCode(building.status) !== BUILT_STATUS || !coversNow(building.registreringFra, building.registreringTil, now) ||
      !coversNow(building.virkningFra, building.virkningTil, now)) return sourceFailed("BBR building record is not current and built at the lookup time");
  return sourceOk(building);
}

function mapBuilding(building: Record<string, unknown>): BbrBuildingData {
  return {
    yearBuilt: asPositiveInt(building.byg026Opfoerelsesaar),
    renovationYear: asPositiveInt(building.byg027OmTilbygningsaar),
    areaSqm: null,
    buildingType: asCode(building.byg021BygningensAnvendelse),
    floors: asPositiveInt(building.byg054AntalEtager),
    roofMaterial: asCode(building.byg033Tagdaekningsmateriale),
    wallMaterial: asCode(building.byg032YdervaeggensMateriale),
    heatingInstallation: decodeHeating(asCode(building.byg056Varmeinstallation), asCode(building.byg057Opvarmningsmiddel)),
    basementSqm: null,
    toiletCount: null,
    bathroomCount: null,
  };
}

/**
 * Narrows a field list to the names the live schema actually defines, so an
 * unverified guess is dropped before it can reject the whole document. Falls
 * back to the list as written when the schema can't be read (introspection is
 * disabled on some deployments) or when the filter would empty the selection
 * set, which is not a legal GraphQL query.
 */
export function fieldsInSchema(fields: readonly string[], schema: Set<string> | null): readonly string[] {
  if (schema === null) return fields;
  const known = fields.filter((field) => schema.has(field));
  return known.length > 0 ? known : fields;
}

async function bygningSchema(apiKey: string): Promise<Set<string> | null> {
  try {
    return await entityFields(BBR_SERVICE, apiKey, BYGNING_TYPE);
  } catch {
    // Best-effort: the two-tier field retry below is the real safety net.
    return null;
  }
}

/**
 * Looks up BBR building facts (year built, renovation year, building
 * use, floors, roof/wall material, heating) for one address by its DAR
 * husnummer UUID.
 *
 * Tries the extended field set first and retries with the verified core set
 * if the server rejects the document, so an unverified field name degrades to
 * *fewer* real facts rather than to none. Both attempts failing is reported as
 * a failed source — never silently backfilled with mock values.
 */
export async function lookupBbr(idLokalid: string | null): Promise<SourceResult<BbrBuildingData>> {
  if (!idLokalid) return sourceFailed("no id_lokalid to look up");

  if (mockModeEnabled(MOCK_FLAG)) return sourceOk(mockBuildingData(idLokalid));
  if (!UUID.test(idLokalid)) return sourceFailed("invalid DAR husnummer UUID");
  const husnummer = idLokalid;

  const apiKey = process.env.DATAFORDELER_API_KEY?.trim() ?? "";
  if (!apiKey) return sourceFailed("DATAFORDELER_API_KEY not configured");

  const tid = new Date().toISOString();
  const schema = await bygningSchema(apiKey);
  if (schema !== null && IDENTITY_FIELDS.some(field => !schema.has(field))) return sourceFailed("BBR schema is missing required identity or temporal fields");

  async function query(fields: readonly string[]): Promise<SourceResult<BbrBuildingData>> {
    const data = await postGraphQl<BuildingData>(BBR_SERVICE, apiKey, buildBygningQuery(husnummer, tid, fieldsInSchema(fields, schema)));
    const selected = currentBuilding(data, husnummer, tid);
    return selected.ok ? sourceOk(mapBuilding(selected.data)) : selected;
  }

  let extendedError: unknown;
  try {
    return await query(EXTENDED_FIELDS);
  } catch (err) {
    extendedError = err;
  }

  try {
    return await query(CORE_FIELDS);
  } catch (coreError) {
    // Surface the core failure (the real problem — endpoint, key or auth)
    // alongside the extended one (a field-name guess) so the diagnostics tell
    // an operator which of the two to go fix.
    const extendedMessage = extendedError instanceof Error ? extendedError.message : String(extendedError);
    const coreMessage = coreError instanceof Error ? coreError.message : String(coreError);
    return sourceFailed(`${coreMessage} (extended field set also failed: ${extendedMessage})`);
  }
}

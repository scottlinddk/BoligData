import { fetchJson } from "../crawl/http.js";
import { asNonEmptyString, asPositiveInt, asPositiveNumber } from "../crawl/map-utils.js";
import { hashSeed, mockModeEnabled, sourceFailed, sourceOk, type SourceResult } from "./types.js";

const MOCK_FLAG = "BBR_MOCK_MODE";

/**
 * BBR (Bygnings- og Boligregistret) building facts, reached through
 * Datafordeler's GraphQL service by walking DAR's `Husnummer` entity across
 * to BBR via `husnummerGiverAdgangTilBygning`.
 *
 * Why the DAR entry point rather than querying `BBR_Bygning` directly: the
 * only value this pipeline holds for a property is the DAR husnummer UUID
 * that `lookupAddressCadastral` resolves, and BBR's Bygning entity is not
 * queryable by that key — the traversal is. The query shape below (top-level
 * `registreringstid`/`virkningstid` arguments, `where: { field: { eq } }`,
 * `nodes`, and BBR's ASCII-transliterated field names such as
 * `byg026Opfoerelsesaar` rather than `byg026Opførelsesår`) follows
 * Datafordeler's published DAR->BBR example. Getting the transliteration
 * wrong is the single most likely cause of an all-null BBR result, because
 * GraphQL rejects the whole document on one unknown field.
 *
 * Auth is a bare API key as the `apiKey` query parameter (username/password
 * "tjenestebruger" login only works for fetching the schema, not for querying
 * entity data). Without `DATAFORDELER_API_KEY` this reports a failed source
 * rather than inventing numbers.
 */
const DAR_VERSION = process.env.DATAFORDELER_DAR_VERSION ?? "v1";
const API_BASE = process.env.DATAFORDELER_DAR_API_BASE ?? `https://graphql.datafordeler.dk/DAR/${DAR_VERSION}`;

const HEATING_TYPES = ["oliefyr", "fjernvarme", "elvarme", "naturgasfyr", "varmepumpe"];
const ROOF_MATERIALS = ["tegl", "fibercement", "built-up-tag", "tagpap", "metalplader"];
const WALL_MATERIALS = ["mursten", "letbeton", "træbeklædning", "betonelementer", "pudset mur"];

export interface BbrBuildingData {
  yearBuilt: number | null;
  renovationYear: number | null;
  /** Residential floor area (byg039) when BBR has one, otherwise the building's total area (byg038). */
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

/**
 * Verified against Datafordeler's published DAR->BBR traversal example. If
 * the extended set below is rejected, this is what the retry falls back to,
 * so year built / area / building use survive a bad guess in any other field.
 */
const CORE_FIELDS = [
  "byg007Bygningsnummer",
  "byg021BygningensAnvendelse",
  "byg026Opfoerelsesaar",
  "byg038SamletBygningsareal",
  "byg039BygningensSamledeBoligAreal",
] as const;

/**
 * Core plus the fields this repo wants but which aren't in the published
 * example — spelled by applying BBR's ASCII transliteration (å->aa, æ->ae,
 * ø->oe) to the documented Danish field labels. Unverified: any one of them
 * being wrong costs the whole document, hence the two-tier retry.
 */
const EXTENDED_FIELDS = [
  ...CORE_FIELDS,
  "byg027OmTilbygningsaar",
  "byg032YdervaeggensMateriale",
  "byg033Tagdaekningsmateriale",
  "byg054AntalEtager",
  "byg056Varmeinstallation",
  "byg057Opvarmningsmiddel",
] as const;

interface GraphQlResponse {
  data?: {
    DAR_Husnummer?: { nodes?: unknown } | null;
  };
  errors?: Array<{ message?: unknown }>;
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

/**
 * Builds the query with the UUID and timestamp inlined as JSON string
 * literals rather than as GraphQL variables. Variables would require naming
 * their types (`String!` vs `DateTime!`), which differ per Datafordeler
 * register and would fail the whole document if guessed wrong; inlining
 * sidesteps that, and `JSON.stringify` does the escaping.
 */
export function buildBygningQuery(idLokalId: string, tid: string, fields: readonly string[]): string {
  return `query HusnummerBygning {
  DAR_Husnummer(
    registreringstid: ${JSON.stringify(tid)}
    virkningstid: ${JSON.stringify(tid)}
    where: { id_lokalId: { eq: ${JSON.stringify(idLokalId)} } }
  ) {
    nodes {
      husnummerGiverAdgangTilBygning {
        ${fields.join("\n        ")}
      }
    }
  }
}`;
}

/**
 * A husnummer can give access to several buildings (house + garage + shed).
 * The one this pipeline means is the dwelling, so pick the largest by
 * residential area, falling back to total building area — a garage never wins
 * that comparison, and picking `[0]` frequently would.
 */
export function pickPrimaryBuilding(nodes: unknown): Record<string, unknown> | null {
  const buildings = asRecordList(nodes).flatMap((node) =>
    "husnummerGiverAdgangTilBygning" in node ? asRecordList(node.husnummerGiverAdgangTilBygning) : [node],
  );

  let best: Record<string, unknown> | null = null;
  let bestArea = -1;
  for (const building of buildings) {
    const area =
      asPositiveNumber(building.byg039BygningensSamledeBoligAreal) ??
      asPositiveNumber(building.byg038SamletBygningsareal) ??
      0;
    if (area > bestArea) {
      best = building;
      bestArea = area;
    }
  }
  return best;
}

function mapBuilding(building: Record<string, unknown>): BbrBuildingData {
  return {
    yearBuilt: asPositiveInt(building.byg026Opfoerelsesaar),
    renovationYear: asPositiveInt(building.byg027OmTilbygningsaar),
    areaSqm:
      asPositiveNumber(building.byg039BygningensSamledeBoligAreal) ??
      asPositiveNumber(building.byg038SamletBygningsareal),
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

async function runQuery(apiKey: string, query: string): Promise<Record<string, unknown> | null> {
  const params = new URLSearchParams({ apiKey });
  const body = await fetchJson<GraphQlResponse>(`${API_BASE}?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => asNonEmptyString(e.message) ?? "unknown GraphQL error").join("; "));
  }

  return pickPrimaryBuilding(body.data?.DAR_Husnummer?.nodes);
}

/**
 * Looks up BBR building facts (year built, renovation year, area, building
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

  const apiKey = process.env.DATAFORDELER_API_KEY;
  if (!apiKey) return sourceFailed("DATAFORDELER_API_KEY not configured");

  const tid = new Date().toISOString();

  let extendedError: unknown;
  try {
    const building = await runQuery(apiKey, buildBygningQuery(idLokalid, tid, EXTENDED_FIELDS));
    if (building !== null) return sourceOk(mapBuilding(building));
    return sourceFailed(`no BBR building linked to husnummer ${idLokalid}`);
  } catch (err) {
    extendedError = err;
  }

  try {
    const building = await runQuery(apiKey, buildBygningQuery(idLokalid, tid, CORE_FIELDS));
    if (building === null) return sourceFailed(`no BBR building linked to husnummer ${idLokalid}`);
    return sourceOk(mapBuilding(building));
  } catch (coreError) {
    // Surface the core failure (the real problem — endpoint, key or auth)
    // alongside the extended one (a field-name guess) so the diagnostics tell
    // an operator which of the two to go fix.
    const extendedMessage = extendedError instanceof Error ? extendedError.message : String(extendedError);
    const coreMessage = coreError instanceof Error ? coreError.message : String(coreError);
    return sourceFailed(`${coreMessage} (extended field set also failed: ${extendedMessage})`);
  }
}

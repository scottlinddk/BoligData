import type { OilTankRecord, OilTankRegistry } from "../../../../../packages/shared/src/types/index.js";
import { asNonEmptyString } from "../shared/map-utils.js";
import { BBR_SERVICE } from "./bbr.js";
import { apiKeyOrFailure, asCode, positiveInt, query, unique } from "./register-query.js";
import { hashSeed, mockModeEnabled, sourceFailed, sourceOk, type SourceResult } from "./types.js";

/**
 * Oil tanks as BBR registers them: technical installations
 * (`BBR_TekniskAnlaeg`) of classification 1110 ("tank"), with the oil tank
 * fields tek026-tek035 and tek067-tek072 filled for them. The heating code on
 * the building says what burns today; this says what is, or was, in the ground.
 *
 * Reaching them from an address
 * -----------------------------
 * The schema (https://datafordeler.dk/GraphQLSchema/BBR.graphql, 2026-10-18)
 * lets `BBR_TekniskAnlaeg` be filtered by `husnummer`, `bygning`, `grund` and
 * `tek020Klassifikation`, and the string filters take `in`. An earlier note in
 * docs/due-diligence-checklist.md said tanks could only be filtered by their own
 * id; that was read off the `@filterRequirement` directive, which is the same
 * one BBR_Bygning carries and which the Bygning lookup already works under by
 * passing `registreringstid`/`virkningstid`. These queries do the same.
 *
 * A tank hangs off the husnummer, the building or the grund depending on who
 * registered it, and the filter has no `or`, so this asks three ways and merges
 * on `id_lokalId`: by husnummer, by the husnummer's buildings and by the
 * husnummer's grunde. Any query failing fails the source, since "no tanks" must
 * never mean "one of the three ways did not answer".
 *
 * What this cannot say
 * --------------------
 * - Whether a tank is oil: classification 1110 is "tank", and the content code
 *   (tek034) needs BBR's code list, which was not reachable when this was
 *   written. The code is passed through, not decoded. In practice 1110 on a
 *   dwelling is a heating oil tank, and the checklist words it as a tank.
 * - That the register is complete. Tanks installed before registration was
 *   required can be missing, and a tank can stay registered after it was
 *   removed. An empty list is "none registered", never "none".
 * - The code values of placement (tek027) and the decommissioning method
 *   (tek028). A tank counts as decommissioned when either is set, or
 *   tek072 (the year) is, or the status is not "Opført"; the codes themselves
 *   are carried raw.
 *
 * Not verified live: no Datafordeler key in the development sandbox.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** tek020Klassifikation of a tank, from the BBR data model: "klassifikationskode 1110" (LIFA/Rigsarkivet). */
export const TANK_CLASSIFICATION = "1110";
/** BBR livscyklus 6 = Opført, as in bbr.ts. */
const BUILT_STATUS = "6";
/** tek110Driftstatus: "Der findes to koder for drift (1 - Drift og 2 - Ikke i drift)" (LIFA). */
const IN_OPERATION = "1";
const NOT_IN_OPERATION = "2";
const PAGE = 50;
/** The string filter's `in` takes at most 100 values (`@filterBounds`). */
const MAX_IN = 100;

const TANK_FIELDS = [
  "id_lokalId",
  "status",
  "tek020Klassifikation",
  "tek024Etableringsaar",
  "tek027Placering",
  "tek028SloejfningOlietank",
  "tek032Stoerrelse",
  "tek034IndholdOlietank",
  "tek035SloejfningsfristOlietank",
  "tek067Fabrikationsaar",
  "tek072Sloejfningsaar",
  "tek110Driftstatus",
].join(" ");

/** A year in a plausible range: a tank cannot predate 1900 or lie in the future. */
function year(value: unknown, now: number): number | null {
  const n = positiveInt(value);
  return n !== null && n >= 1900 && n <= new Date(now).getUTCFullYear() ? n : null;
}

/** `YYYY-MM-DD` of a parseable timestamp. A deadline may lie in the future, so unlike VUR's dates it is not capped at now. */
function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const day = value.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null;
}

export function mapTank(node: Record<string, unknown>, now = Date.now()): OilTankRecord {
  const decommissionedYear = year(node.tek072Sloejfningsaar, now);
  const method = asCode(node.tek028SloejfningOlietank);
  const status = asCode(node.status);
  const drift = asCode(node.tek110Driftstatus);
  return {
    sizeLiters: positiveInt(node.tek032Stoerrelse),
    manufacturedYear: year(node.tek067Fabrikationsaar, now),
    installedYear: year(node.tek024Etableringsaar, now),
    decommissionDeadline: isoDate(node.tek035SloejfningsfristOlietank),
    decommissionedYear,
    decommissioned: decommissionedYear !== null || method !== null || (status !== null && status !== BUILT_STATUS),
    inOperation: drift === IN_OPERATION ? true : drift === NOT_IN_OPERATION ? false : null,
    placementCode: asCode(node.tek027Placering),
    contentCode: asCode(node.tek034IndholdOlietank),
  };
}

function mockRegistry(husnummerId: string): OilTankRegistry {
  const seed = hashSeed(husnummerId);
  return seed % 3 === 0
    ? { tanks: [{ sizeLiters: 1500, manufacturedYear: 1978, installedYear: 1978, decommissionDeadline: null, decommissionedYear: null, decommissioned: false, inOperation: true, placementCode: null, contentCode: null }] }
    : { tanks: [] };
}

/** Anlæg of tank classification matching one reference filter, e.g. `husnummer: { eq: "…" }`. */
async function tanksWhere(apiKey: string, reference: string): Promise<Record<string, unknown>[]> {
  const { nodes, hasNextPage } = await query(
    BBR_SERVICE, apiKey, "BBR_TekniskAnlaeg",
    `${reference}, tek020Klassifikation: { eq: ${JSON.stringify(TANK_CLASSIFICATION)} }`,
    TANK_FIELDS,
    { temporal: true, first: PAGE, pageInfo: true },
  );
  if (hasNextPage !== false) throw new Error("BBR response does not establish a complete list of tanks");
  return nodes;
}

const ids = (nodes: Record<string, unknown>[]): string[] =>
  unique(nodes.map((node) => asNonEmptyString(node.id_lokalId)).filter((id): id is string => id !== null && UUID.test(id)));

/**
 * Tanks BBR registers on a property, found from its DAR husnummer id. An empty
 * list is a real answer ("none registered"); a failed query is not, and fails
 * the source.
 */
export async function lookupBbrTanks(husnummerId: string | null, now = Date.now()): Promise<SourceResult<OilTankRegistry>> {
  if (!husnummerId) return sourceFailed("no husnummer id to look up");
  if (mockModeEnabled("BBR_MOCK_MODE")) return sourceOk(mockRegistry(husnummerId));
  if (!UUID.test(husnummerId)) return sourceFailed("invalid DAR husnummer UUID");
  const key = apiKeyOrFailure();
  if (!key.ok) return key;
  const husnummer = husnummerId.toLowerCase();

  try {
    const [buildings, grunde] = await Promise.all([
      query(BBR_SERVICE, key.data, "BBR_Bygning", `husnummer: { eq: ${JSON.stringify(husnummer)} }`, "id_lokalId", { temporal: true, first: PAGE, pageInfo: true }),
      query(BBR_SERVICE, key.data, "BBR_Grund", `husnummer: { eq: ${JSON.stringify(husnummer)} }`, "id_lokalId", { temporal: true, first: PAGE, pageInfo: true }),
    ]);
    if (buildings.hasNextPage !== false || grunde.hasNextPage !== false) {
      return sourceFailed("BBR response does not establish a complete list of buildings and grunde on this husnummer");
    }
    const buildingIds = ids(buildings.nodes).slice(0, MAX_IN);
    const grundIds = ids(grunde.nodes).slice(0, MAX_IN);

    const found = await Promise.all([
      tanksWhere(key.data, `husnummer: { eq: ${JSON.stringify(husnummer)} }`),
      buildingIds.length > 0 ? tanksWhere(key.data, `bygning: { in: ${JSON.stringify(buildingIds)} }`) : [],
      grundIds.length > 0 ? tanksWhere(key.data, `grund: { in: ${JSON.stringify(grundIds)} }`) : [],
    ]);

    const byId = new Map<string, Record<string, unknown>>();
    for (const node of found.flat()) {
      const id = asNonEmptyString(node.id_lokalId);
      if (id) byId.set(id, node);
    }
    return sourceOk({ tanks: [...byId.values()].map((node) => mapTank(node, now)) });
  } catch (err) {
    return sourceFailed(err);
  }
}

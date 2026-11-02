import type { BbrAtSale } from "../../../../../packages/shared/src/types/index.js";
import { asPositiveInt } from "../shared/map-utils.js";
import { BBR_SERVICE, decodeHeating, fieldsInSchema } from "./bbr.js";
import { entityFields, memoizeAnswer, postGraphQl } from "./datafordeler.js";
import { apiKeyOrFailure, asCode, asNodes, asRecord } from "./register-query.js";
import { sourceFailed, sourceOk, type SourceResult } from "./types.js";

/**
 * What BBR said about the buildings on a husnummer on a given day, for showing and modelling a sale with the
 * home as it was then rather than as it is now (an extension since the sale changes today's area).
 *
 * BBR is bitemporal: `virkningstid` is when a fact applied in the world, `registreringstid` is when the
 * register knew it. This reads **virkningstid = the sale date, registreringstid = now**: the best account of
 * the building on that day, including corrections made since. A model that must only use what was knowable
 * at the sale would instead pin `registreringstid` to the sale date, and BBR was often filled in late, so
 * that would show less than the buyer actually got. The choice is returned (`knowledge`) so nothing downstream
 * mistakes one for the other.
 *
 * Field names: `byg038SamletBygningsareal`, `byg039BygningensSamledeBoligAreal` and the others below follow
 * BBR's published field list and are filtered against the live schema before the query is sent, with the
 * verified core set as the last fallback, the same way `lookupBbr` does it. Not run against the live service.
 */

const BYGNING_TYPE = "BBR_Bygning";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUILT_STATUS = "6"; // Opført
const PAGE = 50;
const IDENTITY = ["id_lokalId", "husnummer", "status", "registreringFra", "registreringTil", "virkningFra", "virkningTil"] as const;
const CORE = ["byg021BygningensAnvendelse", "byg026Opfoerelsesaar"] as const;
const WITH_AREA = [...CORE, "byg027OmTilbygningsaar", "byg038SamletBygningsareal", "byg039BygningensSamledeBoligAreal"] as const;
const FULL = [...WITH_AREA, "byg054AntalEtager", "byg056Varmeinstallation", "byg057Opvarmningsmiddel"] as const;
const TIERS = [FULL, WITH_AREA, CORE] as const;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Noon UTC, so a sale date is inside the same Danish calendar day whatever the offset. */
function effectiveInstant(isoDate: string): string | null {
  const match = ISO_DATE.exec(isoDate);
  if (!match) return null;
  const instant = new Date(`${isoDate}T12:00:00.000Z`);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== isoDate || instant.getTime() > Date.now()) return null;
  return instant.toISOString();
}

export function buildBygningAtQuery(husnummer: string, registrering: string, virkning: string, fields: readonly string[]): string {
  return `query Q { BBR_Bygning(registreringstid: ${JSON.stringify(registrering)} virkningstid: ${JSON.stringify(virkning)} first: ${PAGE} where: { husnummer: { eq: ${JSON.stringify(husnummer)} }, status: { eq: ${JSON.stringify(BUILT_STATUS)} } }) { pageInfo { hasNextPage } nodes { ${[...new Set([...IDENTITY, ...fields])].join(" ")} } } }`;
}

function instantMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Whether a record's validity window [from, to) holds the instant. An open end is `null`. */
function holds(from: unknown, to: unknown, at: number): boolean {
  const start = instantMs(from);
  if (start === null || start > at) return false;
  if (to === null || to === undefined) return true;
  const end = instantMs(to);
  return end !== null && at < end;
}

const area = (value: unknown): number | null => {
  const n = asPositiveInt(value);
  return n !== null && n < 100_000 ? n : null;
};

/** Picks the main building and summarises the husnummer on that day. Pure; exported for tests. */
export function summariseBuildings(nodes: Record<string, unknown>[], asOf: string, husnummer: string, virkning: number): SourceResult<BbrAtSale> {
  const current = nodes.filter(
    (n) =>
      typeof n.husnummer === "string" && n.husnummer.toLowerCase() === husnummer.toLowerCase() &&
      asCode(n.status) === BUILT_STATUS && holds(n.virkningFra, n.virkningTil, virkning),
  );
  if (current.length === 0) return sourceFailed(`no built BBR building registered on this husnummer on ${asOf}`);

  // The dwelling is the building with the most residential area; without any area, the most total area.
  const score = (n: Record<string, unknown>) => (area(n.byg039BygningensSamledeBoligAreal) ?? 0) * 1_000_000 + (area(n.byg038SamletBygningsareal) ?? 0);
  const main = [...current].sort((a, b) => score(b) - score(a))[0]!;
  return sourceOk({
    asOf,
    knowledge: "effective",
    buildingCount: current.length,
    buildingUse: asCode(main.byg021BygningensAnvendelse),
    yearBuilt: asPositiveInt(main.byg026Opfoerelsesaar),
    extensionYear: asPositiveInt(main.byg027OmTilbygningsaar),
    residentialAreaSqm: area(main.byg039BygningensSamledeBoligAreal),
    totalAreaSqm: area(main.byg038SamletBygningsareal),
    floors: asPositiveInt(main.byg054AntalEtager),
    heating: decodeHeating(asCode(main.byg056Varmeinstallation), asCode(main.byg057Opvarmningsmiddel)),
  });
}

async function schemaOrNull(apiKey: string): Promise<Set<string> | null> {
  try {
    return await entityFields(BBR_SERVICE, apiKey, BYGNING_TYPE);
  } catch {
    return null;
  }
}

export function lookupBbrAtDate(husnummerId: string, isoDate: string): Promise<SourceResult<BbrAtSale>> {
  return memoizeAnswer(`bbr-at:${husnummerId.toLowerCase()}:${isoDate}`, () => lookupBbrAtDateUncached(husnummerId, isoDate));
}

async function lookupBbrAtDateUncached(husnummerId: string, isoDate: string): Promise<SourceResult<BbrAtSale>> {
  if (!UUID.test(husnummerId)) return sourceFailed("invalid DAR husnummer UUID");
  const virkning = effectiveInstant(isoDate);
  if (virkning === null) return sourceFailed("not a past calendar date");
  const key = apiKeyOrFailure();
  if (!key.ok) return key;

  const registrering = new Date().toISOString();
  const schema = await schemaOrNull(key.data);
  let firstError: unknown = null;
  for (const tier of TIERS) {
    try {
      const data = await postGraphQl<Record<string, unknown>>(BBR_SERVICE, key.data, buildBygningAtQuery(husnummerId, registrering, virkning, fieldsInSchema(tier, schema)));
      const connection = asRecord(data?.BBR_Bygning);
      if (asRecord(connection?.pageInfo)?.hasNextPage !== false) return sourceFailed("BBR did not return a complete list of buildings on this husnummer");
      return summariseBuildings(asNodes(connection?.nodes), isoDate, husnummerId, Date.parse(virkning));
    } catch (err) {
      firstError ??= err;
    }
  }
  return sourceFailed(firstError);
}

import { asNonEmptyString } from "../crawl/map-utils.js";
import { BBR_SERVICE } from "./bbr.js";
import { memoizeAnswer, type DatafordelerService } from "./datafordeler.js";
import { apiKeyOrFailure, asCode, isoTimestamp, positiveInt, query, registerId, unique } from "./register-query.js";
import { sourceFailed, sourceOk, type SourceResult } from "./types.js";

// Still exported from here for the callers and tests that import them from this module.
export { isoTimestamp, positiveInt, registerId };

/**
 * Public valuations (VUR) for a *house*, found from its DAR husnummer id alone.
 *
 *   husnummer --BBR_Grund.bestemtFastEjendom--> BBR_Ejendomsrelation.bfeNummer
 *   BFE --VUR_BFEKrydsreference--> VUR_Ejendomsvurdering (one row per valuation year)
 *
 * This is a TypeScript port of the chain in `scripts/backfill-bfe-valuation.mjs`, which fills the
 * stored valuations. Keep the two in step: same entities, same valuation-year rules.
 *
 * Why it does not use `lookupEjendomsvurdering`: that source finds field names by introspection,
 * which Datafordeler has switched off (error HC0046), and it keys off matrikel/ejerlav that the
 * address register no longer returns. Every name below was checked against the published schemas
 * (https://datafordeler.dk/GraphQLSchema/{BBR,VUR}.graphql, 2026-10-17), including types:
 * `bfeNummer`, `BFEnummer`, `fkEjendomsvurderingID`, `aar`, `*Beloeb`, `VURMark` are `Long`,
 * BBR queries take `registreringstid`/`virkningstid` and VUR queries take no temporal arguments.
 *
 * Houses only. An apartment is its own BFE (ejerlejlighed) and VUR keys its valuation by that, so
 * the parcel BFE this resolves would return the valuation of the whole building. Callers get that
 * distinction from `classifyHusnummer` and must not ask for apartments.
 *
 * What the schema cannot tell us, and the backfill's author also marked as inferred: that
 * `BBR_Grund.bestemtFastEjendom` holds a `BBR_Ejendomsrelation.id_lokalId`. Every hop fails soft
 * with a reason, so a wrong guess shows up as an unavailable source, never as a wrong number.
 */

/**
 * VUR via Datafordeler's entity-based GraphQL service: `VUR/v2` per Datafordeler's "GraphQL (VUR)" page.
 * The other versions are only tried if v2 starts returning 404, which is how a withdrawn version presents.
 */
export const VUR_SERVICE: DatafordelerService = {
  register: "VUR",
  versionEnv: "DATAFORDELER_VUR_VERSION",
  baseEnv: "DATAFORDELER_VUR_API_BASE",
  versions: ["v2", "v3", "v1"],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BFE_PATTERN = /^\d{1,10}$/;
const BUILT_STATUS = "6"; // BBR livscyklus 6 = Opført, same as bbr.ts
/** First rows to read. A full page is refused rather than trusted, since a truncated list proves nothing. */
const PAGE = 50;

/** byg021 codes of a house: fritliggende, sammenbygget, tæt-lav, række/kæde/dobbelthus. */
export const HOUSE_USE_CODES: ReadonlySet<string> = new Set(["120", "121", "122", "130", "131", "132"]);
/** byg021 codes of a building that holds several households: etagebolig, kollegium, døgninstitution. */
export const MULTI_HOUSEHOLD_USE_CODES: ReadonlySet<string> = new Set(["140", "150", "160"]);

/**
 * VURMark on a VUR_Ejendomsvurdering row. 3 is the new, market based system; 1 is the old annual
 * system. This reading comes from the row pattern, not from the schema.
 */
const NEW_SYSTEM_MARK = 3;
/**
 * Old-system rows are only used for years before this. The old and new series sit at different
 * levels (881,000 against 480,000 in the same year), and SPAR takes a property's latest year
 * whatever its system, so an old 2020 value would be set against new 2020 values.
 */
const NEW_SYSTEM_FROM_YEAR = 2020;

export interface ValuationYear {
  year: number;
  propertyValueDkk: number | null;
  landValueDkk: number | null;
  /** When the register registered the valuation. Null when it gave no usable date. */
  registeredAt: string | null;
}

/* ----------------------------------------------------- house or something else */

/**
 * Whether the husnummer is a house, from the use code of every built building on it. A house usually
 * has outbuildings registered as buildings of their own (garage, carport, shed), so unlike
 * `lookupBbr` this does not need exactly one building.
 *
 * `"other"` covers apartment buildings and anything that is not a plain house (summer house,
 * farm, commercial): none of those get a parcel-level valuation here.
 */
export function classifyHusnummer(husnummerId: string): Promise<SourceResult<"house" | "other">> {
  return memoizeAnswer(`class:${husnummerId.toLowerCase()}`, () => classifyHusnummerUncached(husnummerId));
}

async function classifyHusnummerUncached(husnummerId: string): Promise<SourceResult<"house" | "other">> {
  if (!UUID.test(husnummerId)) return sourceFailed("invalid DAR husnummer UUID");
  const key = apiKeyOrFailure();
  if (!key.ok) return key;
  try {
    const { nodes, hasNextPage } = await query(
      BBR_SERVICE, key.data, "BBR_Bygning",
      `husnummer: { eq: ${JSON.stringify(husnummerId.toLowerCase())} }, status: { eq: ${JSON.stringify(BUILT_STATUS)} }`,
      "byg021BygningensAnvendelse",
      { temporal: true, first: PAGE, pageInfo: true },
    );
    if (hasNextPage !== false) return sourceFailed("BBR response does not establish a complete list of buildings on this husnummer");
    if (nodes.length === 0) return sourceFailed("no current built BBR building linked to this husnummer");
    const uses = nodes.map((node) => asCode(node.byg021BygningensAnvendelse)).filter((code): code is string => code !== null);
    if (uses.length === 0) return sourceFailed("BBR gave no building use for this husnummer");
    if (uses.some((code) => MULTI_HOUSEHOLD_USE_CODES.has(code))) return sourceOk("other");
    return sourceOk(uses.some((code) => HOUSE_USE_CODES.has(code)) ? "house" : "other");
  } catch (err) {
    return sourceFailed(err);
  }
}

/* ------------------------------------------------------------------ husnummer to BFE */

function pickBfe(nodes: Record<string, unknown>[]): SourceResult<string> {
  const values = unique(nodes.map((node) => asCode(node.bfeNummer)).filter((v): v is string => v !== null && BFE_PATTERN.test(v)));
  if (values.length === 0) return sourceFailed("no BFE number in the register response");
  if (values.length > 1) return sourceFailed(`ambiguous: several BFE numbers (${values.join(", ")})`);
  return sourceOk(values[0]!);
}

/** House: husnummer -> BBR_Grund -> bestemtFastEjendom (an Ejendomsrelation id) -> the parcel's BFE. */
export function lookupHouseBfe(husnummerId: string): Promise<SourceResult<string>> {
  return memoizeAnswer(`bfe:${husnummerId.toLowerCase()}`, () => lookupHouseBfeUncached(husnummerId));
}

async function lookupHouseBfeUncached(husnummerId: string): Promise<SourceResult<string>> {
  if (!UUID.test(husnummerId)) return sourceFailed("invalid DAR husnummer UUID");
  const key = apiKeyOrFailure();
  if (!key.ok) return key;
  try {
    const grunde = await query(
      BBR_SERVICE, key.data, "BBR_Grund",
      `husnummer: { eq: ${JSON.stringify(husnummerId.toLowerCase())} }`,
      "id_lokalId bestemtFastEjendom",
      { temporal: true },
    );
    if (grunde.nodes.length === 0) return sourceFailed("no BBR_Grund on this husnummer");
    const relationIds = unique(grunde.nodes.map((node) => asNonEmptyString(node.bestemtFastEjendom)).filter((v): v is string => v !== null));
    if (relationIds.length === 0) return sourceFailed("BBR_Grund has no bestemtFastEjendom reference");

    const relations: Record<string, unknown>[] = [];
    for (const id of relationIds) {
      const found = await query(BBR_SERVICE, key.data, "BBR_Ejendomsrelation", `id_lokalId: { eq: ${JSON.stringify(id)} }`, "id_lokalId bfeNummer", { temporal: true });
      relations.push(...found.nodes);
    }
    return pickBfe(relations);
  } catch (err) {
    return sourceFailed(err);
  }
}

/* ------------------------------------------------------------------ BFE to valuations */

/** Field names on VUR_Ejendomsvurdering, from the published schema. */
const VUR_FIELDS = {
  year: "aar",
  assessed: "ejendomvaerdiBeloeb",
  land: "grundvaerdiBeloeb",
  registered: "ajourfoeringDato",
  system: "VURMark",
  effective: "aendringDato",
} as const;

/**
 * One row per valuation year. A year can hold several rows: the old and new system, a regulation
 * later in the year, or the same value re-registered after a correction. Rule, in order:
 *   1. the new system beats the old one,
 *   2. within a system the latest aendringDato wins,
 *   3. rows with the same value as the winner are one valuation, known from the earliest of them,
 *   4. a year whose top rows share system and date but disagree on value is dropped and counted.
 */
export function buildValuationYears(nodes: Record<string, unknown>[], now = Date.now()): { years: ValuationYear[]; conflictYears: number } {
  interface Candidate { assessed: number | null; land: number | null; registered: string | null; isNew: boolean; effective: string }
  const byYear = new Map<number, Candidate[]>();
  for (const node of nodes) {
    const year = positiveInt(node[VUR_FIELDS.year]);
    const assessed = positiveInt(node[VUR_FIELDS.assessed]);
    const land = positiveInt(node[VUR_FIELDS.land]);
    if (year === null || year < 1990 || year > 2100 || (assessed === null && land === null)) continue;
    const candidate: Candidate = {
      assessed,
      land,
      registered: isoTimestamp(node[VUR_FIELDS.registered], now),
      isNew: Number(node[VUR_FIELDS.system]) === NEW_SYSTEM_MARK,
      effective: typeof node[VUR_FIELDS.effective] === "string" ? (node[VUR_FIELDS.effective] as string) : "",
    };
    if (!candidate.isNew && year >= NEW_SYSTEM_FROM_YEAR) continue;
    byYear.set(year, [...(byYear.get(year) ?? []), candidate]);
  }

  const sameValue = (x: Candidate, y: Candidate) => x.assessed === y.assessed && x.land === y.land;
  const years: ValuationYear[] = [];
  let conflictYears = 0;
  for (const [year, candidates] of byYear) {
    const best = candidates.reduce((top, c) => (c.isNew !== top.isNew ? (c.isNew ? c : top) : c.effective > top.effective ? c : top));
    const top = candidates.filter((c) => c.isNew === best.isNew && c.effective === best.effective);
    if (top.some((c) => !sameValue(c, top[0]!))) {
      conflictYears++;
      continue;
    }
    const registeredAt =
      candidates
        .filter((c) => c.isNew === best.isNew && sameValue(c, best))
        .map((c) => c.registered)
        .filter((r): r is string => r !== null)
        .sort()[0] ?? null;
    years.push({ year, propertyValueDkk: best.assessed, landValueDkk: best.land, registeredAt });
  }
  return { years: years.sort((x, y) => x.year - y.year), conflictYears };
}

/** VUR has no BFE column on the valuation: BFE -> VUR_BFEKrydsreference -> VUR_Ejendomsvurdering.id. */
export async function lookupValuationYears(bfe: string): Promise<SourceResult<ValuationYear[]>> {
  if (!BFE_PATTERN.test(bfe)) return sourceFailed("not a valid BFE number");
  const key = apiKeyOrFailure();
  if (!key.ok) return key;
  try {
    const refs = await query(VUR_SERVICE, key.data, "VUR_BFEKrydsreference", `BFEnummer: { eq: ${Number(bfe)} }`, "fkEjendomsvurderingID", { first: PAGE });
    const ids = unique(refs.nodes.map((node) => registerId(node.fkEjendomsvurderingID)).filter((id): id is number => id !== null));
    if (refs.nodes.length >= PAGE) return sourceFailed(`BFE ${bfe} has ${refs.nodes.length}+ valuation cross-references, more than one page (${PAGE}); refusing to keep a truncated list`);
    if (ids.length === 0) return sourceFailed(`no valuation registered for BFE ${bfe}`);

    const found = await query(VUR_SERVICE, key.data, "VUR_Ejendomsvurdering", `id: { in: [${ids.join(", ")}] }`, `id ${Object.values(VUR_FIELDS).join(" ")}`, { first: PAGE });
    if (found.nodes.length >= PAGE) return sourceFailed(`BFE ${bfe} has ${found.nodes.length}+ valuations, more than one page (${PAGE}); refusing to keep a truncated list`);

    const { years, conflictYears } = buildValuationYears(found.nodes);
    if (years.length === 0) return sourceFailed(conflictYears > 0 ? "every valuation year had conflicting values" : `no usable valuation for BFE ${bfe}`);
    return sourceOk(years);
  } catch (err) {
    return sourceFailed(err);
  }
}

/* ------------------------------------------------------------------ the whole chain */

export interface HouseValuationLookup {
  /** `"other"` is not a failure of any register: it is the reason there is no valuation to look up. */
  propertyClass: "house" | "other" | null;
  /** The parcel's BFE number once resolved, kept even when the valuation hop after it fails: it is a fact in its own right. */
  bfeNummer: string | null;
  /** Valuation years, oldest first. */
  valuation: SourceResult<ValuationYear[]>;
}

/**
 * husnummer -> is it a house -> BFE -> valuations. Stops at the first hop that has no answer and says
 * which one, so the register-sources panel can name the reason.
 */
export async function lookupHouseValuation(husnummerId: string | null): Promise<HouseValuationLookup> {
  if (!husnummerId) return { propertyClass: null, bfeNummer: null, valuation: sourceFailed("no husnummer id to look up") };

  const classified = await classifyHusnummer(husnummerId);
  if (!classified.ok) return { propertyClass: null, bfeNummer: null, valuation: sourceFailed(`building use: ${classified.error}`) };
  if (classified.data === "other") {
    return {
      propertyClass: "other",
      bfeNummer: null,
      valuation: sourceFailed("not a house (apartment building or other use): its valuation is keyed by its own BFE, which address lookup does not resolve"),
    };
  }

  const bfe = await lookupHouseBfe(husnummerId);
  if (!bfe.ok) return { propertyClass: "house", bfeNummer: null, valuation: sourceFailed(`bfe: ${bfe.error}`) };

  const years = await lookupValuationYears(bfe.data);
  if (!years.ok) return { propertyClass: "house", bfeNummer: bfe.data, valuation: sourceFailed(`valuation: ${years.error}`) };
  return { propertyClass: "house", bfeNummer: bfe.data, valuation: sourceOk(years.data) };
}

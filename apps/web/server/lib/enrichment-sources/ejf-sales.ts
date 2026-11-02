import type { SoldPriceEntry } from "../../../../../packages/shared/src/types/index.js";
import { HttpError } from "../shared/http.js";
import { asNonEmptyString } from "../shared/map-utils.js";
import { GraphQlError, memoizeAnswer, pickField, postGraphQl, schemaTypeFields, type DatafordelerService } from "./datafordeler.js";
import { apiKeyOrFailure, asCode, asNodes, asRecord, positiveInt, unique } from "./register-query.js";
import { sourceFailed, sourceOk, type SourceResult } from "./types.js";

/**
 * Registered sales of one property from Datafordeler's EJF (Ejerfortegnelsen), by BFE number.
 *
 *   BFE --EJF_Ejerskifte.bestemtFastEjendomBFENr--> ownership changes
 *   ownership change --EJF_Handelsoplysninger--> koebsaftaledato + samletKoebesum
 *
 * WHAT IS VERIFIED AND WHAT IS NOT. `bestemtFastEjendomBFENr` and `anmeldelsesdato` (on the ownership
 * change) and `samletKoebesum` and `koebsaftaledato` (on the trade details) come from the schema dump the
 * discovery script printed (`scripts/discover-datafordeler.test.mjs` pins that shape). Nothing else here has
 * been run against the live service: this repo's sandbox has no key. In particular:
 *
 * - **Access.** The README records that EJF is licensed separately from the other registers. A key without
 *   it is answered with 401/403 or an authorisation error, and that is reported as `requires_access`
 *   instead of as "no sales".
 * - **The link between the two entities** is read off the schema (`EJF_Handelsoplysninger` pointing at its
 *   ownership change, or the other way round) rather than guessed. If neither side has a recognisable link
 *   field, the lookup fails and names the fields it did see, so `scripts/discover-datafordeler.mjs` output
 *   can settle it.
 * - **Sale type is never inferred.** The code list behind the trade's kind is not verified, so every entry is
 *   `unknown`. The UI then does not present it as an arm's-length price.
 *
 * Every failure is a failed `SourceResult` with a reason. Nothing is mocked: a sale history is a factual
 * claim about a person's property, and an invented one is worse than none.
 */

export const EJF_SERVICE: DatafordelerService = {
  register: "EJF",
  versionEnv: "DATAFORDELER_EJF_VERSION",
  baseEnv: "DATAFORDELER_EJF_API_BASE",
  versions: ["v1"],
};

const EJERSKIFTE_TYPE = "EJF_Ejerskifte";
const HANDEL_TYPE = "EJF_Handelsoplysninger";
const BFE_PATTERN = /^\d{1,10}$/;
/** A property rarely has more than a dozen ownership changes. A full page is refused, not trusted. */
const PAGE = 100;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const ACCESS_ERROR = /unauthori[sz]ed|forbidden|not (?:allowed|permitted|authori[sz]ed)|access (?:is )?denied|no access|insufficient/i;

export const EJF_ACCESS_MESSAGE =
  "EJF (Ejerfortegnelsen) is licensed separately from BBR/VUR/MAT, and this API key has no access to it. Apply to Geodatastyrelsen for EJF on the same Datafordeler user, then retry.";

export interface RegisteredSales {
  /** Newest first. */
  entries: SoldPriceEntry[];
  /** Trades dropped for having no purchase-agreement date or no positive price (gifts and some family transfers carry 0). */
  skipped: number;
}

interface EjfFields {
  ownership: { id: string; bfe: string; handelLink: string | null };
  handel: { id: string; ownershipLink: string | null; date: string; price: string };
}

/** Field names this repo needs, resolved against the published schema. Exported for tests. */
export function resolveEjfFields(ownershipFields: Set<string>, handelFields: Set<string>): SourceResult<EjfFields> {
  const ownershipId = pickField(ownershipFields, "idlokalid");
  const bfe = pickField(ownershipFields, "bestemtfastejendombfenr");
  const handelId = pickField(handelFields, "idlokalid");
  const date = pickField(handelFields, "koebsaftaledato");
  const price = pickField(handelFields, "samletkoebesum");
  const missing = Object.entries({ [`${EJERSKIFTE_TYPE}.id_lokalId`]: ownershipId, [`${EJERSKIFTE_TYPE}.bestemtFastEjendomBFENr`]: bfe, [`${HANDEL_TYPE}.id_lokalId`]: handelId, [`${HANDEL_TYPE}.koebsaftaledato`]: date, [`${HANDEL_TYPE}.samletKoebesum`]: price })
    .filter(([, v]) => v === null)
    .map(([k]) => k);
  if (missing.length > 0) {
    return sourceFailed(`EJF schema lacks the expected fields (${missing.join(", ")}); run scripts/discover-datafordeler.mjs and compare`);
  }

  // Which side holds the reference. Trade details pointing at their ownership change is the natural shape.
  const ownershipLink = pickField(handelFields, "ejerskiftelokalid", "ejerskifteid", "ejerskifte");
  const handelLink = pickField(ownershipFields, "handelsoplysningerlokalid", "handelsoplysningerid", "handelsoplysninger", "handel");
  if (ownershipLink === null && handelLink === null) {
    return sourceFailed(
      `EJF schema has no recognisable link between ${EJERSKIFTE_TYPE} and ${HANDEL_TYPE} ` +
        `(saw ${[...ownershipFields].filter((f) => /handel/i.test(f)).join(", ") || "none"} / ${[...handelFields].filter((f) => /ejerskifte/i.test(f)).join(", ") || "none"})`,
    );
  }
  return sourceOk({
    ownership: { id: ownershipId!, bfe: bfe!, handelLink },
    handel: { id: handelId!, ownershipLink, date: date!, price: price! },
  });
}

/** Posts with bitemporal arguments, and again without them when the register says it has none. */
async function postEjf(apiKey: string, document: (temporal: string) => string): Promise<Record<string, unknown> | null> {
  const now = JSON.stringify(new Date().toISOString());
  try {
    return await postGraphQl<Record<string, unknown>>(EJF_SERVICE, apiKey, document(`registreringstid: ${now} virkningstid: ${now}`));
  } catch (err) {
    if (err instanceof GraphQlError && err.hasUnknownArgument) return postGraphQl<Record<string, unknown>>(EJF_SERVICE, apiKey, document(""));
    throw err;
  }
}

export function buildOwnershipQuery(bfe: number, fields: EjfFields, temporal: string): string {
  const selection = unique([fields.ownership.id, fields.ownership.handelLink, "anmeldelsesdato"].filter((f): f is string => f !== null)).join(" ");
  return `query Q { ${EJERSKIFTE_TYPE}(${temporal} first: ${PAGE} where: { ${fields.ownership.bfe}: { eq: ${bfe} } }) { pageInfo { hasNextPage } nodes { ${selection} } } }`;
}

export function buildHandelQuery(ids: string[], linkField: string | null, fields: EjfFields, temporal: string): string {
  const key = linkField ?? fields.handel.id;
  const selection = unique([fields.handel.id, fields.handel.ownershipLink, fields.handel.date, fields.handel.price].filter((f): f is string => f !== null)).join(" ");
  return `query Q { ${HANDEL_TYPE}(${temporal} first: ${PAGE} where: { ${key}: { in: [${ids.map((id) => JSON.stringify(id)).join(", ")}] } }) { pageInfo { hasNextPage } nodes { ${selection} } } }`;
}

function isoDay(value: unknown): string | null {
  const text = asNonEmptyString(value);
  if (!text || !ISO_DATE.test(text)) return null;
  const day = text.slice(0, 10);
  const ms = Date.parse(`${day}T00:00:00Z`);
  // A calendar-valid date, not in the future, and not before the register's own era.
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== day) return null;
  return ms <= Date.now() && ms >= Date.UTC(1900, 0, 1) ? day : null;
}

/** Trades to entries. Pure, so the mapping is testable without a register. */
export function mapTrades(nodes: Record<string, unknown>[], fields: Pick<EjfFields["handel"], "id" | "date" | "price">): RegisteredSales {
  const seen = new Set<string>();
  const entries: SoldPriceEntry[] = [];
  let skipped = 0;
  for (const node of nodes) {
    const soldDate = isoDay(node[fields.date]);
    const price = positiveInt(node[fields.price]);
    if (soldDate === null || price === null) {
      skipped++;
      continue;
    }
    // The same trade can be registered twice (a correction). Same day and same price is one sale.
    const key = `${soldDate}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = asCode(node[fields.id]);
    entries.push({ soldDate, price, pricePerSqm: null, saleType: "unknown", ...(id ? { registrationId: `ejf:${id}` } : {}) });
  }
  entries.sort((a, b) => b.soldDate.localeCompare(a.soldDate));
  return { entries, skipped };
}

function failureOf(err: unknown): string {
  if (err instanceof HttpError && (err.status === 401 || err.status === 403)) return EJF_ACCESS_MESSAGE;
  if (err instanceof GraphQlError && err.messages.some((m) => ACCESS_ERROR.test(m))) return EJF_ACCESS_MESSAGE;
  return err instanceof Error ? err.message : String(err);
}

/**
 * Registered sales of the property with this BFE number, newest first.
 *
 * The caller decides whether a BFE stands for the home in question: a parcel BFE is right for a house, and
 * wrong for an apartment, whose own BFE this does not resolve.
 */
export function lookupRegisteredSales(bfe: string): Promise<SourceResult<RegisteredSales>> {
  return memoizeAnswer(`ejf:${bfe}`, () => lookupRegisteredSalesUncached(bfe));
}

async function lookupRegisteredSalesUncached(bfe: string): Promise<SourceResult<RegisteredSales>> {
  if (!BFE_PATTERN.test(bfe)) return sourceFailed("not a valid BFE number");
  const key = apiKeyOrFailure();
  if (!key.ok) return key;

  try {
    const [ownershipFields, handelFields] = await Promise.all([
      schemaTypeFields(EJF_SERVICE, key.data, EJERSKIFTE_TYPE),
      schemaTypeFields(EJF_SERVICE, key.data, HANDEL_TYPE),
    ]);
    if (ownershipFields === null || handelFields === null) {
      return sourceFailed(`EJF schema does not define ${ownershipFields === null ? EJERSKIFTE_TYPE : HANDEL_TYPE}`);
    }
    const resolved = resolveEjfFields(ownershipFields, handelFields);
    if (!resolved.ok) return resolved;
    const fields = resolved.data;

    const ownership = await postEjf(key.data, (t) => buildOwnershipQuery(Number(bfe), fields, t));
    const ownershipConnection = asRecord(ownership?.[EJERSKIFTE_TYPE]);
    if (asRecord(ownershipConnection?.pageInfo)?.hasNextPage !== false) {
      return sourceFailed("EJF did not return a complete list of ownership changes for this BFE");
    }
    const changes = asNodes(ownershipConnection?.nodes);
    if (changes.length === 0) return sourceOk({ entries: [], skipped: 0 });

    // Trade details are keyed by the ownership change's id, or by the ids the change points at.
    const byLink = fields.handel.ownershipLink !== null;
    const ids = unique(
      changes
        .map((c) => asCode(byLink ? c[fields.ownership.id] : c[fields.ownership.handelLink!]))
        .filter((v): v is string => v !== null),
    );
    if (ids.length === 0) return sourceOk({ entries: [], skipped: 0 });

    const trades = await postEjf(key.data, (t) => buildHandelQuery(ids, byLink ? fields.handel.ownershipLink : null, fields, t));
    const tradeConnection = asRecord(trades?.[HANDEL_TYPE]);
    if (asRecord(tradeConnection?.pageInfo)?.hasNextPage !== false) {
      return sourceFailed("EJF did not return a complete list of trade details for this BFE");
    }
    return sourceOk(mapTrades(asNodes(tradeConnection?.nodes), fields.handel));
  } catch (err) {
    return sourceFailed(failureOf(err));
  }
}

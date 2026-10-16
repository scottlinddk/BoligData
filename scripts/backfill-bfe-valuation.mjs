#!/usr/bin/env node
/**
 * Backfill id_lokalid, BFE numbers and public valuations (VUR) for stored
 * properties, straight from Datafordeler (DAR, BBR, VUR). Replaces the DAWA
 * based path, which closed on 2026-08-17.
 *
 * Chain per property:
 *   Boligsiden addressId --DAR_Adresse--> husnummer id (properties.id_lokalid)
 *   houses:     husnummer --BBR_Bygning--> BBR_Grund --> BFE of the parcel
 *   apartments: addressId --BBR_Enhed----> BBR_Ejerlejlighed --> BFE of the unit
 *   BFE --VUR_Ejendomsvurdering--> one row per valuation year
 *
 * Apartments take their own route on purpose. An ejerlejlighed has its own BFE,
 * and VUR keys valuations by it. The parcel BFE (what address-lookup.ts stored
 * until now) would fetch the wrong valuation.
 *
 * NOTHING HERE IS VERIFIED AGAINST THE LIVE SCHEMA. Field names are resolved
 * from the services' own introspection and every hop fails soft with a reason
 * instead of guessing. Run in this order:
 *
 *   node scripts/backfill-bfe-valuation.mjs --discover      # print the real field names
 *   node scripts/backfill-bfe-valuation.mjs --probe         # does addressId -> id_lokalid hold?
 *   node scripts/backfill-bfe-valuation.mjs --limit 20      # dry run, writes nothing
 *   node scripts/backfill-bfe-valuation.mjs --limit 20 --write
 *   node scripts/backfill-bfe-valuation.mjs --write         # everything
 *
 * Environment:
 *   DATAFORDELER_API_KEY        required
 *   SUPABASE_URL                (or VITE_SUPABASE_URL) required except for --discover
 *   SUPABASE_SERVICE_ROLE_KEY   required except for --discover
 * Apply migration 027 before using --write.
 */
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const HOST = 'https://graphql.datafordeler.dk';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BFE_PATTERN = /^\d{1,10}$/;
const BUILT_STATUS = '6'; // BBR livscyklus 6 = Opført, same as bbr.ts
const UNIT_TYPES = new Set(['apartment', 'villa_apartment']);

export const SERVICES = {
  DAR: { register: 'DAR', versions: ['v3', 'v2', 'v1'], versionEnv: 'DATAFORDELER_DAR_VERSION', baseEnv: 'DATAFORDELER_DAR_API_BASE' },
  BBR: { register: 'BBR', versions: ['v3', 'v2', 'v1'], versionEnv: 'DATAFORDELER_BBR_VERSION', baseEnv: 'DATAFORDELER_BBR_API_BASE' },
  VUR: { register: 'VUR', versions: ['v2', 'v3', 'v1'], versionEnv: 'DATAFORDELER_VUR_VERSION', baseEnv: 'DATAFORDELER_VUR_API_BASE' },
};

/* ------------------------------------------------------------------ helpers */

export class GraphQlError extends Error {
  constructor(messages) {
    super(messages.join('; '));
    this.name = 'GraphQlError';
    this.messages = messages;
  }
}

/** Auth or configuration problems: retrying or continuing cannot help. */
export class FatalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FatalError';
  }
}

/** Keeps API keys out of anything printed or logged. */
export function redact(text) {
  return String(text).replace(/(apikey|token|key)=[^&\s"']+/gi, '$1=[redacted]');
}

export function foldFieldName(name) {
  return name.toLowerCase().replace(/å/g, 'aa').replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/[^a-z0-9]/g, '');
}

/** Same rule as pickField in datafordeler.ts: exact fold match first, then the shortest field that starts with a term. */
export function pickField(fields, ...terms) {
  const names = [...fields];
  const folded = new Map(names.map((name) => [name, foldFieldName(name)]));
  for (const term of terms) {
    const exact = names.find((name) => folded.get(name) === term);
    if (exact !== undefined) return exact;
  }
  for (const term of terms) {
    const prefixed = names
      .filter((name) => folded.get(name).startsWith(term))
      .sort((a, b) => a.length - b.length || a.localeCompare(b));
    if (prefixed[0] !== undefined) return prefixed[0];
  }
  return null;
}

const ok = (value) => ({ ok: true, value });
const fail = (reason) => ({ ok: false, reason });
const unique = (values) => [...new Set(values)];
const asString = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : typeof v === 'number' ? String(v) : null);
const asNodes = (v) => (Array.isArray(v) ? v.filter((n) => n && typeof n === 'object' && !Array.isArray(n)) : []);
const summarize = (info) => {
  const names = [...info.keys()];
  return names.length > 14 ? `${names.slice(0, 14).join(', ')}, ... (${names.length} fields)` : names.join(', ');
};

export function positiveInt(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded > 0 && rounded <= 1e12 ? rounded : null;
}

/** ISO timestamp for a parseable date between 1990 and now, else null (a future date is never "known"). */
export function isoTimestamp(value, now = Date.now()) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms < Date.UTC(1990, 0, 1) || ms > now) return null;
  return new Date(ms).toISOString();
}

/* ---------------------------------------------------------------- arguments */

export const USAGE = `Usage: node scripts/backfill-bfe-valuation.mjs [options]
  --discover            print field names of the DAR/BBR/VUR types used, then exit
  --probe               classify addressId/id_lokalid (DAR_Adresse vs DAR_Husnummer), compare derived and stored ids,
                        and list which VUR valuation years exist (no writes)
  --write               persist results (default is a dry run)
  --limit <n>           process at most n properties (probe: sample size, default 20)
  --rps <n>             Datafordeler requests per second, 0.1 to 10 (default 2)
  --no-sold-first       do not process properties with sales first
  --fix-apartment-bfe   overwrite a stored parcel-level bfe_nummer on apartments with the unit BFE`;

export function parseArgs(argv) {
  const o = { discover: false, probe: false, write: false, limit: null, rps: 2, soldFirst: true, fixApartmentBfe: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--discover') o.discover = true;
    else if (a === '--probe') o.probe = true;
    else if (a === '--write') o.write = true;
    else if (a === '--no-sold-first') o.soldFirst = false;
    else if (a === '--fix-apartment-bfe') o.fixApartmentBfe = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--limit') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) throw new Error('--limit needs a positive integer');
      o.limit = n;
    } else if (a === '--rps') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n < 0.1 || n > 10) throw new Error('--rps needs a number between 0.1 and 10');
      o.rps = n;
    } else throw new Error(`Unknown argument ${a}`);
  }
  if (o.discover && (o.probe || o.write)) throw new Error('--discover cannot be combined with --probe or --write');
  if (o.probe && o.write) throw new Error('--probe never writes; drop --write');
  return o;
}

/* ------------------------------------------------------ Datafordeler client */

export function createThrottle(rps, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
  const gap = 1000 / rps;
  let next = 0;
  return async () => {
    const t = now();
    const wait = Math.max(0, next - t);
    next = Math.max(t, next) + gap;
    if (wait > 0) await sleep(wait);
  };
}

export function namedType(type) {
  let list = false;
  for (let cur = type; cur; cur = cur.ofType) {
    if (cur.kind === 'LIST') list = true;
    if (cur.name) return { name: cur.name, kind: cur.kind, list };
  }
  return { name: null, kind: null, list };
}

export function createDatafordeler({ apiKey, throttle, fetchImpl = (...a) => fetch(...a), env = process.env, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const resolved = new Map();
  const typeCache = new Map();
  const backoff = (attempt) => 1000 * 2 ** attempt;

  function bases(service) {
    const base = env[service.baseEnv]?.trim();
    if (base) return [base.replace(/\/+$/, '')];
    const pinned = env[service.versionEnv]?.trim();
    return (pinned ? [pinned] : service.versions).map((v) => `${HOST}/${service.register}/${v}`);
  }

  async function send(url, body) {
    for (let attempt = 0; ; attempt++) {
      await throttle();
      let res;
      try {
        res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } catch (err) {
        if (attempt >= 3) throw new Error(redact(`network error: ${err?.cause?.code ?? err?.message ?? err}`));
        await sleep(backoff(attempt));
        continue;
      }
      if (res.status === 401 || res.status === 403) throw new FatalError(`Datafordeler rejected the API key (HTTP ${res.status})`);
      if (res.status === 404) return { notFound: true };
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        const retryAfter = Number(res.headers?.get?.('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : backoff(attempt));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} from Datafordeler`);
      return { body: await res.json() };
    }
  }

  /** POSTs a document. A 404 means a withdrawn version segment, so the next candidate is tried. */
  async function post(service, query) {
    const known = resolved.get(service.register);
    const all = bases(service);
    const list = known ? [known, ...all.filter((b) => b !== known)] : all;
    for (const base of list) {
      const r = await send(`${base}?${new URLSearchParams({ apiKey })}`, { query });
      if (r.notFound) continue;
      resolved.set(service.register, base);
      const errors = r.body?.errors;
      if (Array.isArray(errors) && errors.length) {
        throw new GraphQlError(errors.map((e) => redact(typeof e?.message === 'string' ? e.message : 'unknown GraphQL error')));
      }
      return r.body?.data ?? null;
    }
    throw new Error(`no ${service.register} endpoint answered (every version segment returned 404)`);
  }

  /** Field name -> { name, kind, list } for an entity type, or null when the schema lacks it. */
  async function fieldsOf(service, typeName) {
    const key = `${service.register}:${typeName}`;
    if (typeCache.has(key)) return typeCache.get(key);
    const data = await post(
      service,
      `query Introspect { __type(name: ${JSON.stringify(typeName)}) { fields { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } }`,
    );
    const fields = data?.__type?.fields;
    let result = null;
    if (Array.isArray(fields) && fields.length) {
      result = new Map();
      for (const f of fields) if (typeof f?.name === 'string') result.set(f.name, namedType(f.type));
    }
    typeCache.set(key, result);
    return result;
  }

  return { post, fieldsOf };
}

/**
 * Runs `Entity(where: ...) { nodes { ... } }`. Datafordeler's bitemporal
 * registreringstid/virkningstid arguments exist on some entity queries and not
 * others, and only the error text says which. BBR needs them (bbr.ts: without
 * them it returns all-null), so BBR tries them first; the others try without.
 */
export async function queryNodes(client, service, entity, where, selection, { temporal = 'auto' } = {}) {
  const tid = JSON.stringify(new Date().toISOString());
  const build = (withTid) =>
    `query Q { ${entity}(${withTid ? `registreringstid: ${tid} virkningstid: ${tid} ` : ''}where: { ${where} }) { nodes { ${selection} } } }`;
  const order = temporal === 'first' ? [true, false] : [false, true];
  let firstError;
  for (const withTid of order) {
    try {
      const data = await client.post(service, build(withTid));
      return asNodes(data?.[entity]?.nodes);
    } catch (err) {
      if (!(err instanceof GraphQlError)) throw err;
      firstError ??= err;
    }
  }
  throw firstError;
}

/* --------------------------------------------------------------------- hops */

function readBfeValues(raw, sub) {
  const items = Array.isArray(raw) ? raw : [raw];
  return items
    .map((item) => (sub ? (item && typeof item === 'object' ? item[sub] : null) : item))
    .map(asString)
    .filter((v) => v !== null && BFE_PATTERN.test(v));
}

/** How this schema spells the BFE number on an entity: a scalar, or an object with a number inside. */
async function bfeSelection(client, service, info) {
  const field = pickField(info.keys(), 'bfenummer', 'bestemtfastejendom', 'bfe');
  if (!field) return null;
  const t = info.get(field);
  if (t.kind === 'SCALAR' || t.kind === 'ENUM') return { field, sub: null, selection: field };
  const subInfo = t.name ? await client.fieldsOf(service, t.name) : null;
  const sub = subInfo ? pickField(subInfo.keys(), 'bfenummer', 'bfe', 'nummer') : null;
  return sub ? { field, sub, selection: `${field} { ${sub} }` } : null;
}

export function pickBfe(nodes, sel) {
  const values = unique(nodes.flatMap((n) => readBfeValues(n?.[sel.field], sel.sub)));
  if (values.length === 0) return fail('no BFE number in the register response');
  if (values.length > 1) return fail(`ambiguous: several BFE numbers (${values.join(', ')})`);
  return ok(values[0]);
}

/** Boligsiden addressId (a DAR address) -> husnummer id, the value stored as properties.id_lokalid. */
export async function resolveHusnummer(client, addressId) {
  if (!UUID.test(addressId)) return fail('addressId is not a UUID');
  const info = await client.fieldsOf(SERVICES.DAR, 'DAR_Adresse');
  if (!info) return fail('DAR_Adresse is not in the DAR schema');
  const field = pickField(info.keys(), 'husnummer');
  if (!field) return fail(`DAR_Adresse has no husnummer field; fields: ${summarize(info)}`);
  if (info.get(field).kind === 'OBJECT') return fail(`DAR_Adresse.${field} is an object type, script expects an id`);
  const nodes = await queryNodes(client, SERVICES.DAR, 'DAR_Adresse', `id_lokalId: { eq: ${JSON.stringify(addressId)} }`, `id_lokalId ${field}`);
  const ids = unique(nodes.map((n) => asString(n[field])).filter(Boolean));
  if (ids.length === 0) return fail('no DAR_Adresse found for this addressId');
  if (ids.length > 1) return fail(`DAR_Adresse references several husnumre (${ids.join(', ')})`);
  if (!UUID.test(ids[0])) return fail('the husnummer reference is not a UUID');
  return ok(ids[0].toLowerCase());
}

/**
 * Which DAR entity does an id belong to? DAR keeps unit addresses (DAR_Adresse, floor/door) and
 * access addresses (DAR_Husnummer, the entrance) as separate UUID spaces, so a Boligsiden addressId
 * and a stored id_lokalid can be the same kind of id or not. Returns 'adresse', 'husnummer',
 * 'both' (never expected, reported if seen) or 'none'.
 */
export async function classifyAddressId(client, id) {
  if (!UUID.test(String(id))) return fail('not a UUID');
  const hit = async (entity) => (await queryNodes(client, SERVICES.DAR, entity, `id_lokalId: { eq: ${JSON.stringify(String(id).toLowerCase())} }`, 'id_lokalId')).length > 0;
  const [adresse, husnummer] = [await hit('DAR_Adresse'), await hit('DAR_Husnummer')];
  return ok(adresse && husnummer ? 'both' : adresse ? 'adresse' : husnummer ? 'husnummer' : 'none');
}

/** Houses: husnummer -> built building -> parcel (Grund) -> BFE of the parcel. */
export async function resolveHouseBfe(client, husnummerId) {
  const grundInfo = await client.fieldsOf(SERVICES.BBR, 'BBR_Grund');
  if (!grundInfo) return fail('BBR_Grund is not in the BBR schema');
  const sel = await bfeSelection(client, SERVICES.BBR, grundInfo);
  if (!sel) return fail(`no BFE field on BBR_Grund; fields: ${summarize(grundInfo)}`);

  let grundNodes;
  if (grundInfo.has('husnummer')) {
    grundNodes = await queryNodes(client, SERVICES.BBR, 'BBR_Grund', `husnummer: { eq: ${JSON.stringify(husnummerId)} }`, sel.selection, { temporal: 'first' });
  } else {
    const bygInfo = await client.fieldsOf(SERVICES.BBR, 'BBR_Bygning');
    const grundField = bygInfo && bygInfo.has('husnummer') ? pickField(bygInfo.keys(), 'grund') : null;
    if (!grundField) return fail('cannot link husnummer to BBR_Grund: BBR_Bygning has no husnummer and grund fields');
    const byg = await queryNodes(client, SERVICES.BBR, 'BBR_Bygning', `husnummer: { eq: ${JSON.stringify(husnummerId)} }, status: { eq: "${BUILT_STATUS}" }`, `id_lokalId ${grundField}`, { temporal: 'first' });
    const grundIds = unique(byg.map((n) => asString(n[grundField])).filter(Boolean));
    if (grundIds.length === 0) return fail('no built BBR_Bygning on this husnummer');
    grundNodes = [];
    for (const gid of grundIds) {
      grundNodes.push(...(await queryNodes(client, SERVICES.BBR, 'BBR_Grund', `id_lokalId: { eq: ${JSON.stringify(gid)} }`, sel.selection, { temporal: 'first' })));
    }
  }
  return pickBfe(grundNodes, sel);
}

/** Apartments: addressId -> BBR_Enhed -> BBR_Ejerlejlighed -> the unit's own BFE. */
export async function resolveUnitBfe(client, addressId) {
  if (!UUID.test(addressId)) return fail('addressId is not a UUID');
  const enhedInfo = await client.fieldsOf(SERVICES.BBR, 'BBR_Enhed');
  if (!enhedInfo) return fail('BBR_Enhed is not in the BBR schema');
  const addressField = pickField(enhedInfo.keys(), 'adresseidentificerer', 'adresse');
  const unitField = pickField(enhedInfo.keys(), 'ejerlejlighed');
  if (!addressField || !unitField) return fail(`BBR_Enhed lacks an address or ejerlejlighed field; fields: ${summarize(enhedInfo)}`);
  if (enhedInfo.get(addressField).kind === 'OBJECT' || enhedInfo.get(unitField).kind === 'OBJECT') {
    return fail('BBR_Enhed address/ejerlejlighed fields are object types, script expects ids');
  }

  const enheder = await queryNodes(client, SERVICES.BBR, 'BBR_Enhed', `${addressField}: { eq: ${JSON.stringify(addressId)} }`, `id_lokalId ${unitField}`, { temporal: 'first' });
  const unitIds = unique(enheder.map((n) => asString(n[unitField])).filter(Boolean));
  if (enheder.length === 0) return fail('no BBR_Enhed for this address');
  if (unitIds.length === 0) return fail('the unit has no ejerlejlighed registration (for example an andelsbolig)');
  if (unitIds.length > 1) return fail(`several ejerlejligheder on this address (${unitIds.join(', ')})`);

  const unitInfo = await client.fieldsOf(SERVICES.BBR, 'BBR_Ejerlejlighed');
  if (!unitInfo) return fail('BBR_Ejerlejlighed is not in the BBR schema');
  const sel = await bfeSelection(client, SERVICES.BBR, unitInfo);
  if (!sel) return fail(`no BFE field on BBR_Ejerlejlighed; fields: ${summarize(unitInfo)}`);
  const nodes = await queryNodes(client, SERVICES.BBR, 'BBR_Ejerlejlighed', `id_lokalId: { eq: ${JSON.stringify(unitIds[0])} }`, sel.selection, { temporal: 'first' });
  return pickBfe(nodes, sel);
}

/** One row per valuation year; a year with two different answers is dropped and counted, never guessed. */
export function buildValuationRows(nodes, fields) {
  const byYear = new Map();
  for (const node of nodes) {
    const year = positiveInt(node[fields.year]);
    const assessed = fields.assessed ? positiveInt(node[fields.assessed]) : null;
    const land = fields.land ? positiveInt(node[fields.land]) : null;
    if (year === null || year < 1990 || year > 2100 || (assessed === null && land === null)) continue;
    const row = { valuation_year: year, assessed_property_value_dkk: assessed, assessed_land_value_dkk: land };
    const registered = fields.registered ? isoTimestamp(node[fields.registered]) : null;
    const seen = byYear.get(year);
    if (!seen) byYear.set(year, { row, conflict: false, registered });
    else {
      if (seen.row.assessed_property_value_dkk !== assessed || seen.row.assessed_land_value_dkk !== land) seen.conflict = true;
      // The same value registered twice: it was known from the earlier registration.
      if (registered !== null && (seen.registered === null || registered < seen.registered)) seen.registered = registered;
    }
  }
  const rows = [];
  let conflictYears = 0;
  for (const { row, conflict, registered } of byYear.values()) {
    if (conflict) conflictYears++;
    // registered_at stays absent (never null-overwritten) when the register gives no usable date.
    else rows.push(registered === null ? row : { ...row, registered_at: registered });
  }
  return { rows: rows.sort((a, b) => a.valuation_year - b.valuation_year), conflictYears };
}

export async function resolveValuations(client, bfe) {
  if (!BFE_PATTERN.test(bfe)) return fail('not a valid BFE number');
  const info = await client.fieldsOf(SERVICES.VUR, 'VUR_Ejendomsvurdering');
  if (!info) return fail('VUR_Ejendomsvurdering is not in the VUR schema');
  const fields = {
    bfe: pickField(info.keys(), 'bfenummer', 'bfe') ?? 'bfeNummer',
    assessed: pickField(info.keys(), 'ejendomsvaerdi', 'vurderetejendomsvaerdi', 'ejendomsvurderingbeloeb'),
    land: pickField(info.keys(), 'grundvaerdi', 'vurderetgrundvaerdi'),
    year: pickField(info.keys(), 'vurderingsaar', 'vurderingaar', 'vurderingsaartal'),
    // Optional: when the register itself registered this valuation. It is what makes a backtest
    // honest, because a valuation must not be used for a date before it was known. Unverified
    // against the live schema, so a miss only leaves registered_at empty (see --discover).
    registered: pickField(info.keys(), 'registreringfra', 'registreringstid'),
  };
  if (!fields.assessed && !fields.land) return fail(`no assessed-value field on VUR_Ejendomsvurdering; fields: ${summarize(info)}`);
  if (!fields.year) return fail(`no valuation-year field on VUR_Ejendomsvurdering; fields: ${summarize(info)}`);
  const selection = unique([fields.assessed, fields.land, fields.year, fields.registered].filter(Boolean)).join(' ');
  const nodes = await queryNodes(client, SERVICES.VUR, 'VUR_Ejendomsvurdering', `${fields.bfe}: { eq: ${JSON.stringify(bfe)} }`, selection);
  const { rows, conflictYears } = buildValuationRows(nodes, fields);
  if (rows.length === 0) return fail(conflictYears > 0 ? 'every valuation year had conflicting values' : `no usable valuation for BFE ${bfe}`);
  return { ok: true, value: rows, conflictYears };
}

/* ------------------------------------------------------------ per property */

/**
 * Resolves one property. Never throws for a register that has no answer:
 * every miss becomes an outcome with a reason. FatalError (bad key) still propagates.
 */
export async function processProperty(client, property, addressId) {
  const unit = UNIT_TYPES.has(property.property_type);
  const result = { propertyId: property.id, type: property.property_type, outcome: 'failed', reason: null, idLokalid: null, derivedIdLokalid: false, bfe: null, bfeDerived: false, bfeConflict: false, valuations: [] };

  let idLokalid = property.id_lokalid ?? null;
  if (!idLokalid) {
    if (!addressId) return { ...result, outcome: 'skipped', reason: 'no id_lokalid and no Boligsiden addressId' };
    const r = await resolveHusnummer(client, addressId);
    if (r.ok) {
      idLokalid = r.value;
      result.derivedIdLokalid = true;
    } else if (!unit) {
      return { ...result, reason: `husnummer: ${r.reason}` };
    } else {
      result.reason = `husnummer: ${r.reason}`; // apartments can still reach their BFE through the addressId
    }
  }
  result.idLokalid = idLokalid;

  let bfe = property.bfe_nummer ?? null;
  // For a unit, a stored BFE is the parcel's (address-lookup.ts), so it is never trusted for VUR.
  if (unit || !bfe) {
    let r;
    if (unit) {
      if (!addressId) return { ...result, reason: 'apartment needs the Boligsiden addressId to find its own BFE' };
      r = await resolveUnitBfe(client, addressId);
    } else {
      if (!idLokalid) return { ...result, reason: 'no husnummer to look up the parcel BFE from' };
      r = await resolveHouseBfe(client, idLokalid);
    }
    if (!r.ok) return { ...result, reason: `bfe: ${r.reason}` };
    result.bfeConflict = Boolean(unit && bfe && bfe !== r.value);
    bfe = r.value;
    result.bfeDerived = true;
  }
  result.bfe = bfe;

  const v = await resolveValuations(client, bfe);
  if (!v.ok) return { ...result, outcome: result.bfeDerived || result.derivedIdLokalid ? 'partial' : 'failed', reason: `valuation: ${v.reason}` };
  return { ...result, outcome: 'ok', reason: v.conflictYears ? `${v.conflictYears} valuation year(s) dropped for conflicting values` : null, valuations: v.value };
}

/* ------------------------------------------------------------------ storage */

export function createDb({ url, key, fetchImpl = (...a) => fetch(...a) }) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1`;
  const auth = { apikey: key, Authorization: `Bearer ${key}` };
  async function request(path, init = {}) {
    const res = await fetchImpl(`${base}/${path}`, { ...init, headers: { ...auth, ...(init.headers ?? {}) } });
    if (!res.ok) {
      const err = new Error(`Supabase ${res.status} on ${path.split('?')[0]}: ${redact((await res.text()).slice(0, 300))}`);
      err.status = res.status;
      throw err;
    }
    return res;
  }
  return {
    async select(path) {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const res = await request(path, { headers: { 'Range-Unit': 'items', Range: `${offset}-${offset + 999}` } });
        const page = await res.json();
        rows.push(...page);
        if (page.length < 1000) return rows;
      }
    },
    async patch(path, body) {
      await request(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body) });
    },
    async upsert(table, rows, onConflict) {
      await request(`${table}?on_conflict=${onConflict}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
    },
  };
}

/** Latest Boligsiden addressId per property from source_observations. */
export function addressIdsByProperty(rows) {
  const map = new Map();
  for (const row of rows) {
    if (map.has(row.property_id)) continue; // rows arrive newest first
    let value = row?.value;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value); // value may be stored as text holding JSON
      } catch {
        continue;
      }
    }
    const id = value?.addressId;
    if (typeof id === 'string' && UUID.test(id)) map.set(row.property_id, id.toLowerCase());
  }
  return map;
}

/** Properties that still lack something, sales-bearing ones first. */
export function selectCandidates({ properties, valuedIds, soldIds, soldFirst = true }) {
  const needs = (p) => !p.bfe_nummer || !p.id_lokalid || !valuedIds.has(p.id);
  const list = properties.filter(needs);
  return list.sort((a, b) => {
    if (soldFirst) {
      const diff = Number(soldIds.has(b.id)) - Number(soldIds.has(a.id));
      if (diff !== 0) return diff;
    }
    return String(a.id).localeCompare(String(b.id));
  });
}

async function persist(db, property, r, opts) {
  const unit = UNIT_TYPES.has(property.property_type);
  const patches = [];
  if (r.derivedIdLokalid && r.idLokalid) patches.push([`properties?id=eq.${property.id}&id_lokalid=is.null`, { id_lokalid: r.idLokalid }]);
  if (r.bfeDerived && r.bfe) {
    if (!property.bfe_nummer) patches.push([`properties?id=eq.${property.id}&bfe_nummer=is.null`, { bfe_nummer: r.bfe }]);
    else if (unit && r.bfeConflict && opts.fixApartmentBfe) patches.push([`properties?id=eq.${property.id}`, { bfe_nummer: r.bfe }]);
  }
  for (const [path, body] of patches) await db.patch(path, body);
  if (r.valuations.length) {
    const observed_at = new Date().toISOString();
    await db.upsert('property_valuations', r.valuations.map((v) => ({ property_id: property.id, bfe_nummer: r.bfe, bfe_type: UNIT_TYPES.has(property.property_type) ? 'EL' : 'SFE', ...v, source: 'datafordeler_vur', data_mode: 'real', observed_at })), 'property_id,valuation_year');
  }
}

/* --------------------------------------------------------------------- main */

async function discover(client) {
  const targets = [
    [SERVICES.DAR, 'DAR_Adresse', null],
    [SERVICES.BBR, 'BBR_Enhed', /adresse|ejerlejlighed|bygning|status|id_lokal/i],
    [SERVICES.BBR, 'BBR_Ejerlejlighed', /bfe|nummer|id_lokal/i],
    [SERVICES.BBR, 'BBR_Bygning', /husnummer|grund|bfe|status|id_lokal/i],
    [SERVICES.BBR, 'BBR_Grund', /husnummer|bfe|jordstykke|id_lokal/i],
    [SERVICES.VUR, 'VUR_Ejendomsvurdering', null],
  ];
  for (const [service, type, filter] of targets) {
    try {
      const info = await client.fieldsOf(service, type);
      if (!info) {
        console.log(`\n${type}: NOT IN SCHEMA`);
        continue;
      }
      const names = [...info.entries()].filter(([name]) => !filter || filter.test(name));
      console.log(`\n${type} (${info.size} fields${filter ? `, showing ${names.length} matching` : ''})`);
      for (const [name, t] of names.slice(0, 80)) console.log(`  ${name}: ${t.list ? '[' : ''}${t.name ?? '?'}${t.list ? ']' : ''}`);
    } catch (err) {
      if (err instanceof FatalError) throw err;
      console.log(`\n${type}: ERROR ${redact(err.message)}`);
    }
  }
}

function groupReasons(results) {
  const counts = new Map();
  for (const r of results) {
    if (!r.reason) continue;
    const key = `${r.outcome}: ${r.reason.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '<uuid>').replace(/\b\d{5,}\b/g, '<n>')}`.slice(0, 160);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
}

export async function main(argv, env = process.env) {
  const opts = parseArgs(argv);
  if (opts.help) return console.log(USAGE);
  const apiKey = env.DATAFORDELER_API_KEY?.trim();
  if (!apiKey) throw new FatalError('DATAFORDELER_API_KEY is not set');
  const client = createDatafordeler({ apiKey, throttle: createThrottle(opts.rps), env });
  if (opts.discover) return discover(client);

  const url = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL)?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new FatalError('SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required');
  const db = createDb({ url, key });

  const properties = await db.select('properties?select=id,property_type,bfe_nummer,id_lokalid&order=id');
  const observations = await db.select('source_observations?select=property_id,value,observed_at&field_name=eq.source_address_id&source=eq.boligsiden&conflict_group=is.null&order=observed_at.desc');
  const addresses = addressIdsByProperty(observations);
  if (addresses.size === 0) console.log('Warning: no source_address_id observations matched (filters: source=boligsiden, conflict_group is null).');

  if (opts.probe) {
    const sample = properties.filter((p) => addresses.has(p.id)).slice(0, opts.limit ?? 20);
    if (sample.length === 0) throw new Error('no property has a Boligsiden addressId to probe');
    const classes = { addressId: new Map(), storedId: new Map() };
    const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
    const years = new Map();
    let match = 0, mismatch = 0, failed = 0, noStored = 0, valued = 0;
    for (const p of sample) {
      const c = await classifyAddressId(client, addresses.get(p.id));
      bump(classes.addressId, c.ok ? c.value : `error: ${c.reason}`);
      if (p.id_lokalid) {
        const s = await classifyAddressId(client, p.id_lokalid);
        bump(classes.storedId, s.ok ? s.value : `error: ${s.reason}`);
      }
      const r = await resolveHusnummer(client, addresses.get(p.id));
      if (!p.id_lokalid) noStored++;
      else if (!r.ok) { failed++; console.log(`FAIL      ${p.id}  ${r.reason}`); }
      else if (r.value === String(p.id_lokalid).toLowerCase()) { match++; console.log(`MATCH     ${p.id}`); }
      else { mismatch++; console.log(`MISMATCH  ${p.id}  derived ${r.value} but stored ${p.id_lokalid}`); }
      // Read-only: resolve the BFE and list which valuation years VUR holds for it.
      const res = await processProperty(client, p, addresses.get(p.id));
      if (res.valuations.length > 0) {
        valued++;
        for (const v of res.valuations) bump(years, v.valuation_year);
      }
    }
    const show = (m) => [...m.entries()].map(([k, n]) => `${k}=${n}`).join(', ') || '-';
    console.log(`\nid class of Boligsiden addressId: ${show(classes.addressId)}`);
    console.log(`id class of stored id_lokalid:    ${show(classes.storedId)}`);
    console.log(`derived vs stored id_lokalid: ${match} match, ${mismatch} mismatch, ${failed} failed, ${noStored} without stored id (of ${sample.length})`);
    console.log(`VUR: ${valued} of ${sample.length} properties have valuations; years: ${show(new Map([...years].sort((a, b) => a[0] - b[0])))}`);
    if (![...years.keys()].some((y) => y >= 2020)) console.log('GATE: VUR returned no valuation year >= 2020. Do not build on the new-system valuations (SPAR) until this is explained.');
    if (mismatch > 0 || (match === 0 && noStored < sample.length)) process.exitCode = 1;
    return;
  }

  let valuedIds = new Set();
  try {
    valuedIds = new Set((await db.select('property_valuations?select=property_id')).map((r) => r.property_id));
  } catch (err) {
    if (opts.write) throw new Error(`property_valuations is not readable (${err.message}). Apply migration 027 first.`);
    console.log('Note: property_valuations does not exist yet; treating every property as unvalued (dry run).');
  }
  const soldIds = new Set((await db.select('sale_transactions?select=property_id')).map((r) => r.property_id));
  let candidates = selectCandidates({ properties, valuedIds, soldIds, soldFirst: opts.soldFirst });
  const totalCandidates = candidates.length;
  if (opts.limit) candidates = candidates.slice(0, opts.limit);
  console.log(`${properties.length} properties, ${totalCandidates} still missing something, processing ${candidates.length}${opts.write ? ' (WRITING)' : ' (dry run, pass --write to persist)'}`);

  const reportPath = `backfill-report-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
  const results = [];
  for (const [i, p] of candidates.entries()) {
    let r;
    try {
      r = await processProperty(client, p, addresses.get(p.id));
      if (opts.write && r.outcome !== 'skipped') await persist(db, p, r, opts);
    } catch (err) {
      if (err instanceof FatalError) throw err;
      r = { propertyId: p.id, type: p.property_type, outcome: 'failed', reason: redact(err.message), valuations: [] };
    }
    results.push(r);
    await appendFile(reportPath, `${JSON.stringify({ ...r, valuations: r.valuations.map((v) => v.valuation_year) })}\n`);
    if ((i + 1) % 10 === 0 || i + 1 === candidates.length) console.log(`  ${i + 1}/${candidates.length}`);
  }

  const by = (o) => results.filter((r) => r.outcome === o).length;
  console.log(`\nok ${by('ok')}, partial ${by('partial')}, failed ${by('failed')}, skipped ${by('skipped')}`);
  console.log(`derived id_lokalid for ${results.filter((r) => r.derivedIdLokalid).length}, BFE for ${results.filter((r) => r.bfeDerived).length}, apartment BFE differing from the stored parcel BFE for ${results.filter((r) => r.bfeConflict).length}`);
  for (const [reason, n] of groupReasons(results)) console.log(`  ${String(n).padStart(4)}  ${reason}`);
  console.log(`per-property report: ${reportPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(redact(err?.message ?? err));
    process.exitCode = err instanceof FatalError ? 2 : 1;
  });
}

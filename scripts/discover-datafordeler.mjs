#!/usr/bin/env node
/**
 * Read-only discovery of what Datafordeler actually exposes, so market-data code is written against
 * the real schema and file contents instead of guessed field names. Writes nothing to any database.
 *
 * Round 3 prints, for DATAFORDELER_API_KEY:
 *   1. GraphQL schema fields (GET <endpoint>/schema, because introspection is not allowed), without the
 *      line cap that cut the EJF trade fields in round 2, with definitions for the EJF types.
 *   2. Two probes that need real data access: one EJF lookup for a single BFE (BFE number and filing date
 *      only, no person fields) and one VUR lookup (BFE to valuation) for the same BFE.
 *   3. A join test on the BBR files for municipality 0851: which keys link Bygning and Enhed to a BFE,
 *      and how many houses and apartments end up with BFE, living area, build year and coordinate.
 *
 *   node scripts/discover-datafordeler.mjs
 *
 * The API key never appears in output: URLs are not printed and errors go through redact().
 */
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { FatalError, foldFieldName, redact } from './backfill-bfe-valuation.mjs';
import { analyzeBbr, readCsvZip } from './datafordeler-bbr-join.mjs';

const FILE_HOST = 'https://api.datafordeler.dk/FileDownloads';
const GRAPHQL_HOST = 'https://graphql.datafordeler.dk';
const REGISTERS = ['BBR', 'VUR', 'DAR', 'EJF'];
/** Entities whose files the market-data pipeline would read. */
const WANTED_ENTITIES = ['bygning', 'enhed', 'grund', 'ejendomsrelation', 'enhedejendomsrelation', 'handelsoplysninger', 'ejerskifte', 'ejendomsvurdering', 'vurderingsejendom', 'bfekrydsreference', 'adresse', 'husnummer', 'adressepunkt', 'navngivenvej'];
const MUNICIPALITY = '0851';
const MAX_ROWS_PER_REGISTER = 40;
/** Files above this many bytes are never downloaded here. */
const MAX_DOWNLOAD_BYTES = 60_000_000;
/** A public BFE seen in the round 2 BBR sample. Used for the two single-property probes. */
const PROBE_BFE = 390985;

const str = (value) => (value === null || value === undefined ? '' : String(value));

/** The listing shape is documented for custom downloads only, so look for the array instead of assuming a key. */
export function findFileRows(json) {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    for (const key of ['AvailableFileDownloads', 'availableFileDownloads', 'Files', 'files', 'Items', 'items']) {
      if (Array.isArray(json[key])) return json[key];
    }
    for (const value of Object.values(json)) {
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') return value;
    }
  }
  return [];
}

/** Case-insensitive property read, because casing in the listing is not guaranteed. */
function read(row, name) {
  const target = name.toLowerCase();
  for (const key of Object.keys(row)) if (key.toLowerCase() === target) return row[key];
  return undefined;
}

const entityKey = (row) => foldFieldName(str(read(row, 'EntityName')).replace(/^[A-Z]+_/, ''));

export function summarizeListing(json) {
  const rows = findFileRows(json);
  const byEntity = new Map();
  for (const row of rows) {
    const entity = str(read(row, 'EntityName'));
    byEntity.set(entity || '(none)', (byEntity.get(entity || '(none)') ?? 0) + 1);
  }
  const wanted = rows.filter((row) => WANTED_ENTITIES.includes(entityKey(row)));
  const municipal = wanted.filter((row) => str(read(row, 'MunicipalityCode')).padStart(4, '0') === MUNICIPALITY);
  const picked = (municipal.length > 0 ? municipal : wanted).slice(0, MAX_ROWS_PER_REGISTER).map((row) => ({
    file: str(read(row, 'Filename')),
    entity: str(read(row, 'EntityName')),
    download: str(read(row, 'TypeOfDownload')),
    data: str(read(row, 'TypeOfData')),
    municipality: str(read(row, 'MunicipalityCode')) || '-',
    generation: str(read(row, 'GenerationNumber')),
    generated: str(read(row, 'GenerationTime')),
    expires: str(read(row, 'ExpirationDate')),
    bytes: str(read(row, 'FileSizeInBytes')) || '-',
    format: str(read(row, 'OutputFileFormat')),
  }));
  const pagination = json && typeof json === 'object' ? (json.PaginationMetadata ?? json.paginationMetadata ?? null) : null;
  return {
    total: rows.length,
    pagination,
    municipalRows: municipal.length,
    byEntity: [...byEntity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25),
    picked,
  };
}

/**
 * Newest file for an entity. `minBytes` skips the 234-byte empty deltas, `maxBytes` keeps big files out.
 * The format is read from the file name (`_csv_` or `_json_`), because outputFileFormat is always "zip".
 */
export function pickFile(rows, { entity, municipality = null, download = 'TotalDownload', data = 'Current', format = 'csv', minBytes = 0, maxBytes = MAX_DOWNLOAD_BYTES }) {
  const wanted = foldFieldName(entity);
  const candidates = rows.filter((row) => {
    if (entityKey(row) !== wanted) return false;
    if (str(read(row, 'TypeOfDownload')).toLowerCase() !== download.toLowerCase()) return false;
    if (data && str(read(row, 'TypeOfData')).toLowerCase() !== data.toLowerCase()) return false;
    if (!new RegExp(`_${format}_`, 'i').test(str(read(row, 'Filename')))) return false;
    if (municipality !== null && str(read(row, 'MunicipalityCode')).padStart(4, '0') !== municipality) return false;
    const size = Number(read(row, 'FileSizeInBytes'));
    if (Number.isFinite(size) && size > 0 && (size > maxBytes || size < minBytes)) return false;
    return true;
  });
  candidates.sort((a, b) => Number(read(b, 'GenerationNumber')) - Number(read(a, 'GenerationNumber')));
  return candidates[0] ?? null;
}

/** Field lines of the named object types in a GraphQL SDL document. Kept for the older tests. */
export function extractSdlTypes(sdl, names) {
  const out = {};
  for (const name of names) {
    const match = new RegExp(`type\\s+${name}\\b[^{]*\\{([^}]*)\\}`).exec(sdl);
    out[name] = match ? match[1].split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && !line.startsWith('"')) : null;
  }
  return out;
}

/**
 * Every field of an object type with its GraphQL type and, when the description carries one, its Danish
 * definition. A field line ends in a directive (`@cost`), which is what tells it apart from description
 * lines such as "type: DateTime". Returns null when the type is missing.
 */
export function describeSdlFields(sdl, typeName) {
  const start = new RegExp(`type\\s+${typeName}\\b[^{]*\\{`).exec(sdl);
  if (!start) return null;
  const rest = sdl.slice(start.index + start[0].length);
  const end = rest.indexOf('\n}');
  const body = end >= 0 ? rest.slice(0, end) : rest;
  const fields = [];
  let definition = '';
  for (const line of body.split('\n')) {
    const def = /^\s*definition \(da\):\s*(.*)$/.exec(line);
    if (def) { definition = def[1].trim(); continue; }
    const field = /^\s+(\w+)(?:\([^)]*\))?:\s*([[\]\w!]+)\s*@/.exec(line);
    if (field) {
      fields.push({ name: field[1], type: field[2], definition });
      definition = '';
    }
  }
  return fields;
}

/** First field whose folded name equals a term, then the first that starts with one. */
export function pickFolded(names, ...terms) {
  for (const term of terms) {
    const exact = names.find((name) => foldFieldName(name) === term);
    if (exact) return exact;
  }
  for (const term of terms) {
    const prefixed = names.find((name) => foldFieldName(name).startsWith(term));
    if (prefixed) return prefixed;
  }
  return null;
}

async function listFiles(register, apiKey) {
  const url = `${FILE_HOST}/GetAvailableFileDownloads?${new URLSearchParams({ Register: register, apikey: apiKey })}`;
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    return { status: 'network error', detail: redact(err?.cause?.code ?? err?.message ?? err) };
  }
  if (!res.ok) return { status: res.status };
  try {
    return { status: res.status, json: await res.json() };
  } catch {
    return { status: res.status, detail: 'response was not JSON' };
  }
}

async function loadListings(apiKey) {
  console.log('\n=== File downloads (api.datafordeler.dk/FileDownloads) ===');
  const listings = {};
  for (const register of REGISTERS) {
    const result = await listFiles(register, apiKey);
    console.log(`[${register}] HTTP ${result.status}${result.detail ? ` (${result.detail})` : ''}`);
    if (!result.json) continue;
    listings[register] = findFileRows(result.json);
    const s = summarizeListing(result.json);
    console.log(`  files: ${s.total}, relevant for ${MUNICIPALITY}: ${s.municipalRows}`);
  }
  return listings;
}

/* ------------------------------------------------------------------ GraphQL */

const GRAPHQL_TARGETS = [
  { register: 'BBR', version: 'v3', types: [['BBR_Ejendomsrelation', null], ['BBR_Grund', null], ['BBR_Bygning', /grund|husnummer|koordinat|position|geo|bfe|ejendom|status|anvendelse|areal|opfoerel|bygge/i], ['BBR_Enhed', /areal|vaerelse|anvendelse|boligtype|status|bfe|ejendom/i]] },
  { register: 'VUR', version: 'v2', types: [['VUR_Ejendomsvurdering', null], ['VUR_BFEKrydsreference', null]] },
  { register: 'EJF', version: 'v1', types: [['EJF_Ejerskifte', null], ['EJF_Handelsoplysninger', null]] },
];
/** Types whose field definitions are printed, because their field names say little. */
const WITH_DEFINITIONS = new Set(['EJF_Ejerskifte', 'EJF_Handelsoplysninger']);

async function postGraphQl(base, apiKey, query) {
  const res = await fetch(`${base}?${new URLSearchParams({ apiKey })}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(60_000),
  });
  return { status: res.status, text: await res.text() };
}

async function rawGraphQl(base, apiKey, query, limit = 500) {
  try {
    const { status, text } = await postGraphQl(base, apiKey, query);
    return { status, body: redact(text).slice(0, limit).replace(/\s+/g, ' '), text };
  } catch (err) {
    return { status: 'network error', body: redact(err?.message ?? err), text: '' };
  }
}

async function printSchemas(apiKey) {
  console.log('=== GraphQL schemas (GET <endpoint>/schema) ===');
  const schemas = {};
  for (const target of GRAPHQL_TARGETS) {
    const base = `${GRAPHQL_HOST}/${target.register}/${target.version}`;
    console.log(`\n[${target.register} ${target.version}]`);
    try {
      const res = await fetch(`${base}/schema?${new URLSearchParams({ apiKey })}`, { signal: AbortSignal.timeout(120_000) });
      const text = await res.text();
      console.log(`  GET schema -> HTTP ${res.status}, ${text.length} chars`);
      if (!res.ok) continue;
      schemas[target.register] = { base, sdl: text };
      for (const [typeName, filter] of target.types) {
        const fields = describeSdlFields(text, typeName);
        if (!fields) { console.log(`  ${typeName}: NOT IN SCHEMA`); continue; }
        const shown = fields.filter((f) => !/^datafordeler/.test(f.name) && (!filter || filter.test(f.name)));
        console.log(`  ${typeName}: ${fields.length} fields, ${shown.length} shown`);
        for (const f of shown) {
          const definition = WITH_DEFINITIONS.has(typeName) && f.definition ? `  | ${f.definition.slice(0, 160)}` : '';
          console.log(`    ${f.name}: ${f.type}${definition}`);
        }
      }
    } catch (err) {
      console.log(`  GET schema failed: ${redact(err?.message ?? err)}`);
    }
  }
  return schemas;
}

async function printProbes(apiKey, schemas) {
  console.log(`\n=== Single-BFE probes (BFE ${PROBE_BFE}) ===`);
  const ejf = schemas.EJF?.base ?? `${GRAPHQL_HOST}/EJF/v1`;
  const now = JSON.stringify(new Date().toISOString());
  const ejfWhere = `where: { bestemtFastEjendomBFENr: { eq: ${PROBE_BFE} } }`;
  for (const [label, args] of [['plain', ejfWhere], ['temporal', `registreringstid: ${now} virkningstid: ${now} ${ejfWhere}`]]) {
    const r = await rawGraphQl(ejf, apiKey, `{ EJF_Ejerskifte(${args}) { nodes { bestemtFastEjendomBFENr anmeldelsesdato } } }`, 700);
    console.log(`\n[EJF_Ejerskifte ${label}] HTTP ${r.status}: ${r.body}`);
  }

  const vur = schemas.VUR;
  if (!vur) return;
  const names = (describeSdlFields(vur.sdl, 'VUR_Ejendomsvurdering') ?? []).map((f) => f.name);
  const valuation = [pickFolded(names, 'id'), pickFolded(names, 'aar'), pickFolded(names, 'ejendomvaerdibeloeb', 'ejendomsvaerdibeloeb'), pickFolded(names, 'grundvaerdibeloeb')].filter(Boolean);
  console.log(`\n[VUR] field names picked for the valuation: ${valuation.join(', ') || '(none)'}`);
  const cross = await rawGraphQl(vur.base, apiKey, `{ VUR_BFEKrydsreference(where: { BFEnummer: { eq: ${PROBE_BFE} } }) { nodes { BFEnummer fkEjendomsvurderingID } } }`, 700);
  console.log(`[VUR_BFEKrydsreference] HTTP ${cross.status}: ${cross.body}`);
  let ids = [];
  try {
    ids = (JSON.parse(cross.text)?.data?.VUR_BFEKrydsreference?.nodes ?? []).map((n) => n.fkEjendomsvurderingID).filter((v) => /^\d+$/.test(String(v)));
  } catch { /* the call above already printed what went wrong */ }
  if (ids.length > 0 && valuation.length > 0) {
    const r = await rawGraphQl(vur.base, apiKey, `{ VUR_Ejendomsvurdering(where: { ${valuation[0]}: { in: [${ids.slice(0, 10).join(',')}] } }) { nodes { ${valuation.join(' ')} } } }`, 900);
    console.log(`[VUR_Ejendomsvurdering by id] HTTP ${r.status}: ${r.body}`);
  }
}

/* ------------------------------------------------------------ BBR join test */

async function downloadZip(apiKey, filename, dir) {
  const target = join(dir, filename.replace(/[^\w.-]/g, '_'));
  const res = await fetch(`${FILE_HOST}/GetFile?${new URLSearchParams({ Filename: filename, apikey: apiKey })}`, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok || !res.body) throw new Error(`download failed with HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(target));
  return target;
}

const BBR_TABLES = {
  rel: { entity: 'Ejendomsrelation', columns: ['id_lokalId', 'bfeNummer', 'ejendomstype', 'samletFastEjendom', 'ejerlejlighed'] },
  enhedRel: { entity: 'EnhedEjendomsrelation', columns: ['ejerlejlighed', 'enhed'] },
  enhed: { entity: 'Enhed', columns: ['id_lokalId', 'enh020EnhedensAnvendelse', 'enh027ArealTilBeboelse'] },
  bygning: { entity: 'Bygning', columns: ['id_lokalId', 'grund', 'byg021BygningensAnvendelse', 'byg026Opførelsesår', 'byg039BygningensSamledeBoligAreal'], findPoint: true },
  grund: { entity: 'Grund', columns: ['id_lokalId', 'bestemtFastEjendom', 'husnummer'] },
};

async function printBbrJoin(apiKey, listings) {
  console.log(`\n=== BBR join test, municipality ${MUNICIPALITY} ===`);
  const dir = await mkdtemp(join(tmpdir(), 'datafordeler-bbr-'));
  try {
    const tables = {};
    for (const [key, spec] of Object.entries(BBR_TABLES)) {
      const row = pickFile(listings.BBR ?? [], { entity: spec.entity, municipality: MUNICIPALITY });
      if (!row) { console.log(`[${spec.entity}] no matching file`); return; }
      const filename = str(read(row, 'Filename'));
      const zip = await downloadZip(apiKey, filename, dir);
      const table = await readCsvZip(zip, { columns: spec.columns, findPoint: spec.findPoint });
      tables[key] = table.rows;
      console.log(`[${spec.entity}] ${filename}: ${table.rows.length} rows, ${table.header.length} columns${table.missing.length ? `, MISSING ${table.missing.join(', ')}` : ''}${table.pointColumn ? `, point column ${table.pointColumn}` : ''}`);
      if (table.missing.length > 0) {
        console.log(`  related columns: ${table.header.filter((name) => /grund|husnummer|ejendom|bestemt/i.test(name)).join(', ') || '(none)'}`);
      }
    }
    const report = analyzeBbr(tables);
    console.log('\nejendomstype counts in Ejendomsrelation:', JSON.stringify(report.ejendomstype));
    console.log('join hypotheses:');
    for (const [name, value] of Object.entries(report.hypotheses)) console.log(`  ${name}: ${value}`);
    console.log('houses:', JSON.stringify(report.houses));
    console.log('apartments:', JSON.stringify(report.apartments));
    console.log('example houses:', JSON.stringify(report.example));
  } catch (err) {
    console.log(`BBR join test failed: ${redact(err?.message ?? err)}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function main(env = process.env) {
  const apiKey = env.DATAFORDELER_API_KEY?.trim();
  if (!apiKey) throw new FatalError('DATAFORDELER_API_KEY is not set');
  const schemas = await printSchemas(apiKey);
  await printProbes(apiKey, schemas);
  const listings = await loadListings(apiKey);
  await printBbrJoin(apiKey, listings);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(redact(err instanceof Error ? err.message : err));
    process.exitCode = 1;
  });
}

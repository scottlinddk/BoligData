#!/usr/bin/env node
/**
 * Read-only discovery of what Datafordeler actually exposes, so market-data code is written against
 * the real schema and file contents instead of guessed field names. Writes nothing to any database.
 *
 * Prints, for DATAFORDELER_API_KEY:
 *   1. GraphQL probes. Introspection answered HTTP 400 in round 1, so print the error text and try
 *      the documented schema URL (GET <endpoint>/schema), then pull the fields of the types we need.
 *   2. The file-download listing (api.datafordeler.dk/FileDownloads) per register, summarised.
 *   3. The header and first rows of a few small files (BBR for municipality 0851, VUR delta files,
 *      DAR Adressepunkt). Zone 0 data only. Nothing is stored and big files are skipped.
 *   4. EJF: the file listing only. Person entities are never queried.
 *
 *   node scripts/discover-datafordeler.mjs
 *
 * The API key never appears in output: URLs are not printed and errors go through redact().
 */
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { FatalError, foldFieldName, redact } from './backfill-bfe-valuation.mjs';

const FILE_HOST = 'https://api.datafordeler.dk/FileDownloads';
const GRAPHQL_HOST = 'https://graphql.datafordeler.dk';
const REGISTERS = ['BBR', 'VUR', 'DAR', 'EJF'];
/** Entities whose files the market-data pipeline would read. */
const WANTED_ENTITIES = ['bygning', 'enhed', 'grund', 'ejendomsrelation', 'enhedejendomsrelation', 'handelsoplysninger', 'ejerskifte', 'ejendomsvurdering', 'vurderingsejendom', 'bfekrydsreference', 'adresse', 'husnummer', 'adressepunkt', 'navngivenvej'];
const MUNICIPALITY = '0851';
const MAX_ROWS_PER_REGISTER = 40;
/** Files above this many bytes are never downloaded here. */
const MAX_SAMPLE_BYTES = 60_000_000;
const SAMPLE_LINES = 4;
const MAX_LINE_CHARS = 1200;

const asList = (value) => (Array.isArray(value) ? value : []);
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
    topLevelKeys: json && typeof json === 'object' && !Array.isArray(json) ? Object.keys(json) : [],
    rowKeys: rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]) : [],
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
export function pickFile(rows, { entity, municipality = null, download = 'TotalDownload', data = 'Current', format = 'csv', minBytes = 0, maxBytes = MAX_SAMPLE_BYTES }) {
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

/** Field lines of the named object types in a GraphQL SDL document. */
export function extractSdlTypes(sdl, names) {
  const out = {};
  for (const name of names) {
    const match = new RegExp(`type\\s+${name}\\b[^{]*\\{([^}]*)\\}`).exec(sdl);
    out[name] = match ? match[1].split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && !line.startsWith('"')) : null;
  }
  return out;
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

async function printFileListings(apiKey) {
  console.log('\n=== File downloads (api.datafordeler.dk/FileDownloads) ===');
  const listings = {};
  for (const register of REGISTERS) {
    const result = await listFiles(register, apiKey);
    console.log(`\n[${register}] HTTP ${result.status}${result.detail ? ` (${result.detail})` : ''}`);
    if (!result.json) continue;
    listings[register] = findFileRows(result.json);
    const s = summarizeListing(result.json);
    console.log(`  rows on this page: ${s.total}; pagination: ${s.pagination ? JSON.stringify(s.pagination) : 'none reported'}`);
    console.log(`  files per entity: ${s.byEntity.map(([name, n]) => `${name}=${n}`).join(', ') || '(none)'}`);
    console.log(`  relevant rows for municipality ${MUNICIPALITY}: ${s.municipalRows} (showing ${s.picked.length})`);
    for (const f of s.picked.slice(0, 12)) console.log(`   - ${f.file} | ${f.entity} | ${f.download}/${f.data} | kom ${f.municipality} | gen ${f.generation} | expires ${f.expires} | ${f.bytes} B`);
  }
  return listings;
}

/* ------------------------------------------------------------------ GraphQL */

const GRAPHQL_TARGETS = [
  { register: 'BBR', version: 'v3', types: ['BBR_Ejendomsrelation', 'BBR_BygningEjendomsrelation', 'BBR_EnhedEjendomsrelation', 'BBR_Enhed', 'BBR_Bygning', 'BBR_Grund'] },
  { register: 'VUR', version: 'v2', types: ['VUR_Ejendomsvurdering', 'VUR_Vurderingsejendom', 'VUR_BFEKrydsreference'] },
  { register: 'EJF', version: 'v1', types: ['EJF_Ejerskifte', 'EJF_Handelsoplysninger'] },
];

async function rawGraphQl(base, apiKey, query) {
  try {
    const res = await fetch(`${base}?${new URLSearchParams({ apiKey })}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(60_000),
    });
    return { status: res.status, body: redact(await res.text()).slice(0, 500).replace(/\s+/g, ' ') };
  } catch (err) {
    return { status: 'network error', body: redact(err?.message ?? err) };
  }
}

async function printGraphQl(apiKey) {
  console.log('=== GraphQL probes ===');
  for (const target of GRAPHQL_TARGETS) {
    const base = `${GRAPHQL_HOST}/${target.register}/${target.version}`;
    console.log(`\n[${target.register} ${target.version}]`);
    for (const query of ['{ __typename }', '{ __schema { queryType { name } } }']) {
      const r = await rawGraphQl(base, apiKey, query);
      console.log(`  POST ${query} -> HTTP ${r.status}: ${r.body}`);
    }
    try {
      const res = await fetch(`${base}/schema?${new URLSearchParams({ apiKey })}`, { signal: AbortSignal.timeout(120_000) });
      const text = await res.text();
      console.log(`  GET schema -> HTTP ${res.status}, ${res.headers.get('content-type') ?? 'no content-type'}, ${text.length} chars`);
      if (res.ok && /\btype\s+\w+/.test(text)) {
        for (const [name, lines] of Object.entries(extractSdlTypes(text, target.types))) {
          console.log(`  ${name}: ${lines ? `${lines.length} fields` : 'NOT IN SCHEMA'}`);
          for (const line of (lines ?? []).slice(0, 80)) console.log(`    ${line}`);
        }
      } else {
        console.log(`  schema body starts: ${redact(text).slice(0, 300).replace(/\s+/g, ' ')}`);
      }
    } catch (err) {
      console.log(`  GET schema failed: ${redact(err?.message ?? err)}`);
    }
  }
}

/* ------------------------------------------------------------- file samples */

export function firstLines(zipPath, count) {
  return new Promise((resolve) => {
    const child = spawn('unzip', ['-p', zipPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      for (let i = buffer.indexOf('\n'); i >= 0 && out.length < count; i = buffer.indexOf('\n')) {
        out.push(buffer.slice(0, i).replace(/\r$/, ''));
        buffer = buffer.slice(i + 1);
      }
      if (out.length >= count) child.kill();
    });
    child.on('close', () => resolve(out));
    child.on('error', (err) => resolve([`unzip failed: ${err.message}`]));
  });
}

async function sampleFile(apiKey, filename) {
  const dir = await mkdtemp(join(tmpdir(), 'datafordeler-'));
  const zip = join(dir, 'sample.zip');
  try {
    const res = await fetch(`${FILE_HOST}/GetFile?${new URLSearchParams({ Filename: filename, apikey: apiKey })}`, { signal: AbortSignal.timeout(240_000) });
    if (!res.ok || !res.body) return { status: res.status, lines: [] };
    await pipeline(Readable.fromWeb(res.body), createWriteStream(zip));
    return { status: res.status, lines: await firstLines(zip, SAMPLE_LINES) };
  } catch (err) {
    return { status: 'error', lines: [redact(err?.message ?? err)] };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const SAMPLES = [
  { register: 'BBR', entity: 'Ejendomsrelation', municipality: MUNICIPALITY },
  { register: 'BBR', entity: 'EnhedEjendomsrelation', municipality: MUNICIPALITY },
  { register: 'BBR', entity: 'BygningEjendomsrelation', municipality: MUNICIPALITY },
  { register: 'BBR', entity: 'Enhed', municipality: MUNICIPALITY },
  { register: 'BBR', entity: 'Bygning', municipality: MUNICIPALITY },
  { register: 'BBR', entity: 'Grund', municipality: MUNICIPALITY },
  { register: 'DAR', entity: 'Adressepunkt', municipality: MUNICIPALITY },
  { register: 'VUR', entity: 'Ejendomsvurdering', download: 'DeltaDownload', data: 'Bitemporal', minBytes: 5000 },
  { register: 'VUR', entity: 'Vurderingsejendom', download: 'DeltaDownload', data: 'Bitemporal', minBytes: 5000 },
  { register: 'VUR', entity: 'BFEKrydsreference', download: 'DeltaDownload', data: 'Bitemporal', minBytes: 1000 },
];

async function printSamples(apiKey, listings) {
  console.log('\n=== File samples (header and first rows, zone 0 data) ===');
  for (const sample of SAMPLES) {
    const row = pickFile(listings[sample.register] ?? [], sample);
    if (!row) {
      console.log(`\n[${sample.register} ${sample.entity}] no matching small file in the listing`);
      continue;
    }
    const filename = str(read(row, 'Filename'));
    const result = await sampleFile(apiKey, filename);
    console.log(`\n[${sample.register} ${sample.entity}] ${filename} (${str(read(row, 'FileSizeInBytes')) || '?'} B) -> HTTP ${result.status}`);
    if (result.lines.length === 0) console.log('  (no lines read from the file)');
    result.lines.forEach((line, i) => console.log(`  ${i === 0 ? 'header' : `row ${i}`}: ${redact(line).slice(0, MAX_LINE_CHARS)}`));
  }
}

export async function main(env = process.env) {
  const apiKey = env.DATAFORDELER_API_KEY?.trim();
  if (!apiKey) throw new FatalError('DATAFORDELER_API_KEY is not set');
  await printGraphQl(apiKey);
  const listings = await printFileListings(apiKey);
  await printSamples(apiKey, listings);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(redact(err instanceof Error ? err.message : err));
    process.exitCode = 1;
  });
}

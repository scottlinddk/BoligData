#!/usr/bin/env node
/**
 * Read-only discovery of what Datafordeler actually exposes, so market-data code is written against
 * the real schema and file listings instead of guessed field names. Writes nothing anywhere.
 *
 * Prints, for DATAFORDELER_API_KEY:
 *   1. GraphQL entity types and the fields of the BBR/VUR types the BFE chain needs.
 *   2. The file-download listing (api.datafordeler.dk/FileDownloads) per register, summarised.
 *   3. The HTTP status for EJF, to show whether an API key is enough there.
 *
 *   node scripts/discover-datafordeler.mjs
 *
 * The API key never appears in output: URLs are not printed and errors go through redact().
 */
import { pathToFileURL } from 'node:url';
import { SERVICES, FatalError, createDatafordeler, createThrottle, foldFieldName, redact } from './backfill-bfe-valuation.mjs';

const FILE_HOST = 'https://api.datafordeler.dk/FileDownloads';
const REGISTERS = ['BBR', 'VUR', 'DAR', 'EJF'];
/** Entities whose files the market-data pipeline would read. */
const WANTED_ENTITIES = ['bygning', 'enhed', 'grund', 'ejendomsrelation', 'enhedejendomsrelation', 'handelsoplysninger', 'ejerskifte', 'ejendomsvurdering', 'vurderingsejendom', 'adresse', 'husnummer'];
const MUNICIPALITY = '0851';
const MAX_ROWS_PER_REGISTER = 40;

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

export function summarizeListing(json) {
  const rows = findFileRows(json);
  const byEntity = new Map();
  for (const row of rows) {
    const entity = str(read(row, 'EntityName'));
    byEntity.set(entity || '(none)', (byEntity.get(entity || '(none)') ?? 0) + 1);
  }
  const wanted = rows.filter((row) => WANTED_ENTITIES.includes(foldFieldName(str(read(row, 'EntityName')).replace(/^[A-Z]+_/, ''))));
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
  for (const register of REGISTERS) {
    const result = await listFiles(register, apiKey);
    console.log(`\n[${register}] HTTP ${result.status}${result.detail ? ` (${result.detail})` : ''}`);
    if (!result.json) continue;
    const s = summarizeListing(result.json);
    console.log(`  top-level keys: ${s.topLevelKeys.join(', ') || '(array)'}`);
    console.log(`  row keys: ${s.rowKeys.join(', ') || '(no rows)'}`);
    console.log(`  rows on this page: ${s.total}; pagination: ${s.pagination ? JSON.stringify(s.pagination) : 'none reported'}`);
    console.log(`  files per entity: ${s.byEntity.map(([name, n]) => `${name}=${n}`).join(', ') || '(none)'}`);
    console.log(`  relevant rows for municipality ${MUNICIPALITY}: ${s.municipalRows} (showing ${s.picked.length})`);
    for (const f of s.picked) console.log(`   - ${f.file} | ${f.entity} | ${f.download}/${f.data} | kom ${f.municipality} | gen ${f.generation} @ ${f.generated} | expires ${f.expires} | ${f.bytes} B | ${f.format}`);
  }
}

const TYPE_TARGETS = [
  [SERVICES.BBR, ['Ejendomsrelation', 'BygningEjendomsrelation', 'EnhedEjendomsrelation', 'Enhed', 'Bygning', 'Grund', 'GrundJordstykke', 'Ejerlejlighed']],
  [SERVICES.VUR, ['Ejendomsvurdering', 'Vurderingsejendom', 'Fordeling']],
];
const FIELD_FILTER = /bfe|ejendom|type|areal|opfoerel|bygge|boligareal|bebygget|koordinat|husnummer|kommune|grund|status|vurder|aar|registrering|virkning|id_lokal|nummer|beloeb|vaerdi/i;

async function printGraphQl(client) {
  console.log('=== GraphQL entity types and fields ===');
  for (const [service, names] of TYPE_TARGETS) {
    try {
      const data = await client.post(service, '{ __schema { types { name kind } } }');
      const types = asList(data?.__schema?.types).filter((t) => t.kind === 'OBJECT' && new RegExp(`^${service.register}_`).test(t.name));
      console.log(`\n[${service.register}] object types: ${types.map((t) => t.name).join(', ') || '(none found)'}`);
    } catch (err) {
      if (err instanceof FatalError) throw err;
      console.log(`\n[${service.register}] type list failed: ${redact(err.message)}`);
    }
    for (const name of names) {
      const typeName = `${service.register}_${name}`;
      try {
        const info = await client.fieldsOf(service, typeName);
        if (!info) { console.log(`\n${typeName}: NOT IN SCHEMA`); continue; }
        const shown = [...info.entries()].filter(([field]) => FIELD_FILTER.test(field));
        console.log(`\n${typeName} (${info.size} fields, ${shown.length} shown)`);
        for (const [field, t] of shown.slice(0, 60)) console.log(`  ${field}: ${t.list ? '[' : ''}${t.name ?? '?'}${t.list ? ']' : ''}`);
      } catch (err) {
        if (err instanceof FatalError) throw err;
        console.log(`\n${typeName}: ERROR ${redact(err.message)}`);
      }
    }
  }
}

export async function main(env = process.env) {
  const apiKey = env.DATAFORDELER_API_KEY?.trim();
  if (!apiKey) throw new FatalError('DATAFORDELER_API_KEY is not set');
  const client = createDatafordeler({ apiKey, throttle: createThrottle(2), env });
  await printGraphQl(client);
  await printFileListings(apiKey);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(redact(err instanceof Error ? err.message : err));
    process.exitCode = 1;
  });
}

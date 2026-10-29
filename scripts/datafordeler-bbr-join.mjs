/**
 * Reading Datafordeler BBR CSV zips and checking how the tables join to a BFE number. Pure helpers
 * plus a zip reader that shells out to `unzip -p`. Used by the read-only discovery script, and written
 * so the later bulk ingest can reuse the parser. Nothing here writes anywhere.
 */
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { foldFieldName } from './datafordeler-common.mjs';

/** BBR byg021 codes for houses: fritliggende, sammenbygget, tæt-lav, række/kæde/dobbelthus. */
export const HOUSE_CODES = new Set(['120', '121', '122', '130', '131', '132']);

/**
 * Streaming CSV parser: quoted fields, doubled quotes, newlines inside quotes, CRLF. Chunk boundaries may
 * fall anywhere, including between the two quotes of an escaped quote.
 */
export function createCsvParser(onRow, delimiter = ',') {
  let field = '';
  let row = [];
  let inQuotes = false;
  let pendingQuote = false;
  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); onRow(row); row = []; };
  return {
    write(chunk) {
      for (let i = 0; i < chunk.length; i++) {
        const c = chunk[i];
        if (pendingQuote) {
          pendingQuote = false;
          if (c === '"') { field += '"'; continue; }
          inQuotes = false;
        }
        if (inQuotes) {
          if (c === '"') pendingQuote = true;
          else field += c;
          continue;
        }
        if (c === '"') { inQuotes = true; continue; }
        if (c === delimiter) { endField(); continue; }
        if (c === '\n') {
          if (field.endsWith('\r')) field = field.slice(0, -1);
          endRow();
          continue;
        }
        field += c;
      }
    },
    end() {
      if (pendingQuote) { pendingQuote = false; inQuotes = false; }
      if (field.endsWith('\r')) field = field.slice(0, -1);
      if (field !== '' || row.length > 0) endRow();
    },
  };
}

/** Exact column names first: a loose /koordinat/ also matches byg133KildeTilKoordinatsæt, which holds a code. */
const POINT_HEADERS = [/^byg404Koordinat$/i, /^position$/i];

export function findPointHeader(header) {
  for (const pattern of POINT_HEADERS) {
    const index = header.findIndex((name) => pattern.test(name));
    if (index >= 0) return index;
  }
  return -1;
}

/**
 * Reads one CSV out of a zip and keeps only the requested columns (matched by folded name).
 * `findPoint` also keeps the column holding a WKT POINT as `point`.
 */
export function readCsvZip(zipPath, { columns, findPoint = false }) {
  return new Promise((resolve, reject) => {
    const child = spawn('unzip', ['-p', zipPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr.resume();
    const decoder = new StringDecoder('utf8');
    const rows = [];
    let header = null;
    let wanted = [];
    let pointIndex = -1;
    let scanned = 0;
    const parser = createCsvParser((cells) => {
      if (header === null) {
        header = cells;
        const folded = new Map(cells.map((name, i) => [foldFieldName(name), i]));
        wanted = columns.map((name) => [name, folded.get(foldFieldName(name)) ?? -1]);
        if (findPoint) pointIndex = findPointHeader(cells);
        return;
      }
      if (findPoint && pointIndex < 0 && scanned < 500) {
        scanned++;
        pointIndex = cells.findIndex((value) => value.startsWith('POINT'));
      }
      const row = {};
      for (const [name, i] of wanted) row[name] = i >= 0 ? (cells[i] ?? '') : '';
      if (findPoint) row.point = pointIndex >= 0 ? (cells[pointIndex] ?? '') : '';
      rows.push(row);
    });
    child.stdout.on('data', (chunk) => parser.write(decoder.write(chunk)));
    child.on('error', reject);
    child.on('close', () => {
      parser.write(decoder.end());
      parser.end();
      resolve({
        header: header ?? [],
        rows,
        missing: header === null ? columns : wanted.filter(([, i]) => i < 0).map(([name]) => name),
        pointColumn: header !== null && pointIndex >= 0 ? header[pointIndex] : null,
      });
    });
  });
}

const number = (value) => {
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

function matchRate(values, set) {
  let total = 0;
  let matched = 0;
  for (const value of values) {
    if (!value) continue;
    total++;
    if (set.has(value)) matched++;
  }
  return { total, matched };
}

const percent = ({ total, matched }) => (total === 0 ? 'n/a' : `${matched}/${total} (${((matched / total) * 100).toFixed(1)}%)`);

/**
 * Checks which keys join Bygning/Enhed to a BFE, and how many houses and apartments end up with a BFE,
 * a living area, a build year and a coordinate. Several join hypotheses are scored side by side, because
 * the key columns were only seen as headers and sample rows.
 *
 * Expected shapes, all rows being plain objects of strings:
 *   rel      Ejendomsrelation        id_lokalId, bfeNummer, ejendomstype
 *   enhedRel EnhedEjendomsrelation   ejerlejlighed, enhed
 *   enhed    Enhed                   id_lokalId, enh020EnhedensAnvendelse, enh027ArealTilBeboelse
 *   bygning  Bygning                 id_lokalId, grund, byg021BygningensAnvendelse, byg026Opførelsesår,
 *                                    byg039BygningensSamledeBoligAreal, point
 *   grund    Grund                   id_lokalId, bestemtFastEjendom
 */
export function analyzeBbr({ rel, enhedRel, enhed, bygning, grund }) {
  const relById = new Map(rel.map((r) => [r.id_lokalId, r]));
  const relBfes = new Set(rel.map((r) => r.bfeNummer).filter(Boolean));
  const grundById = new Map(grund.map((g) => [g.id_lokalId, g]));
  const enhedIds = new Set(enhed.map((e) => e.id_lokalId));
  const enhedRelByEnhed = new Map(enhedRel.map((r) => [r.enhed, r]));

  const types = new Map();
  for (const r of rel) types.set(r.ejendomstype || '(blank)', (types.get(r.ejendomstype || '(blank)') ?? 0) + 1);

  const hypotheses = {
    'Grund.bestemtFastEjendom in Ejendomsrelation.id_lokalId': percent(matchRate(grund.map((g) => g.bestemtFastEjendom), new Set(relById.keys()))),
    'Grund.bestemtFastEjendom in Ejendomsrelation.bfeNummer': percent(matchRate(grund.map((g) => g.bestemtFastEjendom), relBfes)),
    'Bygning.grund in Grund.id_lokalId': percent(matchRate(bygning.map((b) => b.grund), new Set(grundById.keys()))),
    'EnhedEjendomsrelation.ejerlejlighed in Ejendomsrelation.id_lokalId': percent(matchRate(enhedRel.map((r) => r.ejerlejlighed), new Set(relById.keys()))),
    'EnhedEjendomsrelation.ejerlejlighed in Ejendomsrelation.bfeNummer': percent(matchRate(enhedRel.map((r) => r.ejerlejlighed), relBfes)),
    'EnhedEjendomsrelation.enhed in Enhed.id_lokalId': percent(matchRate(enhedRel.map((r) => r.enhed), enhedIds)),
  };

  const bfeFromKey = (key) => {
    if (!key) return '';
    const hit = relById.get(key);
    if (hit?.bfeNummer) return hit.bfeNummer;
    return relBfes.has(key) ? key : '';
  };

  const houses = bygning.filter((b) => HOUSE_CODES.has(b.byg021BygningensAnvendelse));
  const houseBfe = (b) => bfeFromKey(grundById.get(b.grund)?.bestemtFastEjendom);
  const resolvedHouses = houses.filter((b) => houseBfe(b));
  const housesPerBfe = new Map();
  for (const b of resolvedHouses) housesPerBfe.set(houseBfe(b), (housesPerBfe.get(houseBfe(b)) ?? 0) + 1);

  const units = enhed.filter((e) => String(e.enh020EnhedensAnvendelse).startsWith('1') && number(e.enh027ArealTilBeboelse) > 0);
  const unitBfe = (e) => bfeFromKey(enhedRelByEnhed.get(e.id_lokalId)?.ejerlejlighed);
  const resolvedUnits = units.filter((e) => unitBfe(e));
  const unitTypes = new Map();
  for (const e of resolvedUnits) {
    const type = relById.get(enhedRelByEnhed.get(e.id_lokalId)?.ejerlejlighed)?.ejendomstype || '(not by id)';
    unitTypes.set(type, (unitTypes.get(type) ?? 0) + 1);
  }

  const example = resolvedHouses.slice(0, 2).map((b) => ({
    bfe: houseBfe(b), use: b.byg021BygningensAnvendelse, livingArea: b.byg039BygningensSamledeBoligAreal, builtYear: b['byg026Opførelsesår'], point: b.point,
  }));

  return {
    ejendomstype: [...types.entries()].sort((a, b) => b[1] - a[1]),
    hypotheses,
    houses: {
      buildings: houses.length,
      withBfe: resolvedHouses.length,
      withLivingArea: resolvedHouses.filter((b) => number(b.byg039BygningensSamledeBoligAreal) > 0).length,
      withBuiltYear: resolvedHouses.filter((b) => number(b['byg026Opførelsesår']) > 0).length,
      withPoint: resolvedHouses.filter((b) => b.point.startsWith('POINT')).length,
      distinctBfe: housesPerBfe.size,
      bfeWithOneHouse: [...housesPerBfe.values()].filter((n) => n === 1).length,
    },
    apartments: {
      residentialUnits: units.length,
      withBfe: resolvedUnits.length,
      ejendomstypeOfLinkedRelation: [...unitTypes.entries()].sort((a, b) => b[1] - a[1]),
    },
    example,
  };
}

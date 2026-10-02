import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';

export const ENDPOINT = 'https://api.boligsiden.dk/cases/stats';
export const SOURCE_URL = 'https://www.boligsiden.dk/markedsindeks?locationType=country&locationName=danmark&addressType=villa_raekkehus&statType=sold_per_area_price#statistic-section';
export const METRIC = 'sold_per_area_price';
export const ADDRESS_TYPE = 'villa and terraced house';
const target = new URL('../packages/shared/src/data/boligsiden-market-index.json', import.meta.url);

export function createRequests(series, to) {
  return series.map(({ locationType, locationName }) => ({
    type: METRIC, addressType: ADDRESS_TYPE, locationType, locationName,
    from: '2011-01-01', to,
  }));
}

function monthRange(last) {
  const months = [];
  for (let year = 2011; year <= Number(last.slice(0, 4)); year++) {
    for (let month = 1; month <= 12; month++) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      if (key > last) return months;
      months.push(key);
    }
  }
  return months;
}

/** Reject drift and mismatched selectors before replacing a usable snapshot. */
export function normalizeResponse(payload, requests, capturedAt) {
  if (!Array.isArray(payload) || payload.length !== requests.length || !requests.length) {
    throw new Error('Statistics response does not match the requested areas');
  }
  const seenAreas = new Set();
  const series = requests.map((request, index) => {
    if (!['country', 'municipality'].includes(request.locationType) || !request.locationName) throw new Error('Invalid area');
    const identity = `${request.locationType}:${request.locationName}`;
    if (seenAreas.has(identity)) throw new Error('Duplicate area');
    seenAreas.add(identity);
    // The source uses a null series for areas with no publishable observations.
    const rows = payload[index] === null ? [] : payload[index];
    if (!Array.isArray(rows)) throw new Error(`Invalid series for ${identity}`);
    const months = new Map();
    for (const row of rows) {
      const nameMatches = row?.locationName === request.locationName ||
        (request.locationType === 'country' && request.locationName === 'Danmark' && row?.locationName === 'Denmark');
      if (!row || row.type !== METRIC || row.addressType !== ADDRESS_TYPE || row.locationType !== request.locationType || !nameMatches) {
        throw new Error(`Unexpected series identity for ${identity}`);
      }
      if (typeof row.from !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(row.from) || row.from < request.from || row.from > request.to) {
        throw new Error(`Invalid source month for ${identity}`);
      }
      const month = row.from.slice(0, 7);
      const endOfMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
      if (row.to !== endOfMonth) throw new Error(`Unexpected monthly period for ${identity}`);
      if (row.value !== null && (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < 0)) {
        throw new Error(`Invalid price for ${identity}`);
      }
      if (months.has(month) && months.get(month) !== row.value) throw new Error(`Conflicting prices for ${identity} in ${month}`);
      months.set(month, row.value);
    }
    return { locationType: request.locationType, locationName: request.locationName,
      points: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, value })) };
  });
  const countries = series.filter(s => s.locationType === 'country');
  const country = countries[0];
  if (countries.length !== 1 || country.locationName !== 'Danmark' || !country.points.length) throw new Error('Denmark series is missing');
  const latestMonth = series.flatMap(s => s.points.map(p => p.month)).sort().at(-1);
  const months = monthRange(latestMonth);
  if (country.points[0].month !== '2011-01' || country.points.length !== months.length || country.points.some(p => p.value === null)) {
    throw new Error('Denmark history is incomplete; keeping the previous snapshot');
  }
  return {
    source: { name: 'Boligsidens Markedsindeks', url: SOURCE_URL, endpoint: ENDPOINT, capturedAt,
      method: 'public-json-api', metric: METRIC, addressType: 'villa_raekkehus', unit: 'DKK/m²' },
    series: series.map(s => {
      const prices = new Map(s.points.map(p => [p.month, p.value]));
      return { ...s, points: months.map(month => ({ month, value: prices.get(month) ?? null })) };
    }),
  };
}

export function checkRefresh(previous, next) {
  const previousMonth = previous.series[0]?.points.at(-1)?.month;
  if (previousMonth && next.series[0].points.at(-1).month < previousMonth) throw new Error('Source returned older coverage; keeping the previous snapshot');
  for (const prior of previous.series) {
    if (prior.points.some(p => p.value !== null) && !next.series.find(s => s.locationType === prior.locationType && s.locationName === prior.locationName)?.points.some(p => p.value !== null)) {
      throw new Error(`Previously available series disappeared: ${prior.locationName}`);
    }
  }
}

/** Keep generated data compact and readable: one observation per line. */
export function serializeSnapshot(snapshot) {
  return JSON.stringify(snapshot, null, 2).replace(/\{\n\s+"month": "(\d{4}-\d{2})",\n\s+"value": (null|[\d.]+)\n\s+\}/g,
    '{ "month": "$1", "value": $2 }') + '\n';
}

export async function refreshMarketIndex() {
  const previous = JSON.parse(await readFile(target, 'utf8'));
  const capturedAt = new Date().toISOString();
  const requests = createRequests(previous.series, capturedAt.slice(0, 10));
  // This public endpoint accepted ordinary curl requests during verification;
  // Node's native fetch received an HTTP 403 from the source in the same run.
  // No browser session, cookies or credential is needed. Never execute a shell.
  const payload = await new Promise((resolve, reject) => {
    const child = execFile('curl', ['--silent', '--show-error', '--fail-with-body', '--max-time', '60',
      '--request', 'POST', '--header', 'User-Agent: BoligDataResearch/0.1 (personal research project; low-volume daily crawl)',
      '--header', 'Accept: application/json', '--header', 'Content-Type: application/json',
      '--header', 'Referer: https://www.boligsiden.dk/markedsindeks', '--header', 'Origin: https://www.boligsiden.dk',
      '--data-binary', '@-', ENDPOINT], { maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
      if (error) { reject(new Error(`Boligsiden request failed (curl ${error.code}); snapshot unchanged`)); return; }
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Boligsiden did not return JSON; snapshot unchanged')); }
    });
    child.stdin.on('error', () => {}); // execFile reports spawn/transport failure.
    child.stdin.end(JSON.stringify(requests));
  });
  const next = normalizeResponse(payload, requests, capturedAt);
  checkRefresh(previous, next);
  // Only a fully validated response can replace the committed data.
  const temporary = `${fileURLToPath(target)}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, serializeSnapshot(next), 'utf8');
    await rename(temporary, target);
  } finally { await unlink(temporary).catch(() => {}); }
  console.log(`Saved ${next.series.length} area series through ${next.series[0].points.at(-1).month}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  refreshMarketIndex().catch(error => { console.error(error.message); process.exitCode = 1; });
}

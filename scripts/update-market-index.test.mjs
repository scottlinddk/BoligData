import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ADDRESS_TYPE, METRIC, checkRefresh, createRequests, normalizeResponse, serializeSnapshot } from './update-market-index.mjs';

const capturedAt = '2011-03-10T12:00:00.000Z';
const areas = [{ locationType: 'country', locationName: 'Danmark' }, { locationType: 'municipality', locationName: 'Aalborg' }];
const requests = createRequests(areas, '2011-03-10');
const row = (from, value, locationType = 'country', locationName = 'Denmark') => ({
  type: METRIC, addressType: ADDRESS_TYPE, locationType, locationName, from, value,
  to: new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0)).toISOString().slice(0, 10),
});
const country = [row('2011-02-01', 11862), row('2011-01-01', 11922)];

test('sorts actual monthly rows, preserves null areas and absent months', () => {
  const snapshot = normalizeResponse([country, [row('2011-02-01', 0, 'municipality', 'Aalborg')]], requests, capturedAt);
  assert.deepEqual(snapshot.series[0].points, [{ month: '2011-01', value: 11922 }, { month: '2011-02', value: 11862 }]);
  assert.deepEqual(snapshot.series[1].points, [{ month: '2011-01', value: null }, { month: '2011-02', value: 0 }]);
  assert.ok(normalizeResponse([country, null], requests, capturedAt).series[1].points.every(p => p.value === null));
  assert.deepEqual(JSON.parse(serializeSnapshot(snapshot)), snapshot);
});

test('rejects shape drift, incorrect metrics, property types and geographic scope', () => {
  for (const payload of [{ error: 'blocked' }, [country], [country, {}], [null, null]]) {
    assert.throws(() => normalizeResponse(payload, requests, capturedAt));
  }
  for (const change of [{ type: 'sold_time_on_market' }, { addressType: 'condo' }, { locationType: 'municipality' }, { locationName: 'Aarhus' }]) {
    assert.throws(() => normalizeResponse([[{ ...country[0], ...change }, country[1]], null], requests, capturedAt), /identity/);
  }
});

test('rejects malformed, incomplete, future and conflicting observations', () => {
  for (const change of [{ from: '2011-13-01' }, { from: '2011-02-02' }, { from: '2011-04-01' }, { to: '2011-02-27' },
    { value: undefined }, { value: '' }, { value: -1 }, { value: Infinity }]) {
    assert.throws(() => normalizeResponse([[{ ...country[0], ...change }, country[1]], null], requests, capturedAt));
  }
  assert.throws(() => normalizeResponse([[country[0]], null], requests, capturedAt), /incomplete/);
  assert.throws(() => normalizeResponse([[...country, { ...country[0], value: 1 }], null], requests, capturedAt), /Conflicting/);
  assert.equal(normalizeResponse([[...country, country[0]], null], requests, capturedAt).series[0].points.length, 2);
});

test('refuses a refresh which erases previously available areas or newer history', () => {
  const previous = normalizeResponse([country, [row('2011-02-01', 11343, 'municipality', 'Aalborg')]], requests, capturedAt);
  assert.throws(() => checkRefresh(previous, normalizeResponse([country, null], requests, capturedAt)), /disappeared/);
  assert.throws(() => checkRefresh(previous, normalizeResponse([[country[1]], null], requests, capturedAt)), /older coverage/);
  assert.doesNotThrow(() => checkRefresh(previous, previous));
});

test('committed snapshot preserves the source catalog and monthly data contract', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../packages/shared/src/data/boligsiden-market-index.json', import.meta.url), 'utf8'));
  assert.equal(snapshot.source.method, 'public-json-api');
  assert.equal(snapshot.series.length, 100); // Denmark, 98 municipalities, plus source category Christiansø.
  assert.equal(new Set(snapshot.series.map(s => `${s.locationType}:${s.locationName}`)).size, 100);
  for (const series of snapshot.series) {
    assert.ok(series.points.length >= 188);
    assert.equal(series.points[0].month, '2011-01');
    assert.equal(new Set(series.points.map(p => p.month)).size, series.points.length);
    assert.ok(series.points.every(p => p.value === null || (Number.isFinite(p.value) && p.value >= 0)));
  }
  const national = snapshot.series.find(s => s.locationType === 'country');
  assert.equal(national.locationName, 'Danmark');
  assert.ok(national.points.every(p => p.value !== null));
  assert.ok(snapshot.series.some(s => s.locationName === 'Aalborg'));
});

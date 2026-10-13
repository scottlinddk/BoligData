import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FatalError,
  SERVICES,
  addressIdsByProperty,
  buildValuationRows,
  createDatafordeler,
  createThrottle,
  parseArgs,
  pickBfe,
  pickField,
  positiveInt,
  processProperty,
  redact,
  selectCandidates,
} from './backfill-bfe-valuation.mjs';

const ADDRESS = '0a3f50a0-1111-4222-8333-444455556666';
const HUSNUMMER = '0a3f50b1-1111-4222-8333-444455556666';
const GRUND = '0a3f50c2-1111-4222-8333-444455556666';
const ENHED = '0a3f50d3-1111-4222-8333-444455556666';
const UNIT = '0a3f50e4-1111-4222-8333-444455556666';

const scalar = { kind: 'SCALAR', name: 'String', ofType: null };
const field = (name, type = scalar) => ({ name, type });

/** A fake Datafordeler: schema per type name plus a handler for entity queries. */
function fakeApi({ schema, data, failTemporalFor = new Set(), status = 200 }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const query = JSON.parse(init.body).query;
    calls.push({ url, query });
    if (status !== 200) return { status, ok: false, headers: new Headers(), json: async () => ({}) };
    const typeMatch = query.match(/__type\(name: "([^"]+)"\)/);
    if (typeMatch) {
      const fields = schema[typeMatch[1]];
      return { status: 200, ok: true, headers: new Headers(), json: async () => ({ data: { __type: fields ? { fields } : null } }) };
    }
    const entity = query.match(/query Q \{ (\w+)\(/)?.[1];
    const withTime = query.includes('registreringstid');
    if (failTemporalFor.has(entity) && withTime) {
      return { status: 200, ok: true, headers: new Headers(), json: async () => ({ errors: [{ message: 'Unknown argument registreringstid' }] }) };
    }
    const nodes = data[entity] ? data[entity](query) : [];
    return { status: 200, ok: true, headers: new Headers(), json: async () => ({ data: { [entity]: { nodes } } }) };
  };
  return { fetchImpl, calls };
}

const schema = {
  DAR_Adresse: [field('id_lokalId'), field('husnummer')],
  BBR_Enhed: [field('id_lokalId'), field('adresseIdentificerer'), field('ejerlejlighed')],
  BBR_Ejerlejlighed: [field('id_lokalId'), field('bfeNummer')],
  BBR_Grund: [field('id_lokalId'), field('husnummer'), field('bfeNummer')],
  VUR_Ejendomsvurdering: [field('bfeNummer'), field('ejendomsvaerdi'), field('grundvaerdi'), field('vurderingsaar')],
};

function makeClient(overrides = {}) {
  const api = fakeApi({
    schema,
    data: {
      DAR_Adresse: () => [{ id_lokalId: ADDRESS, husnummer: HUSNUMMER }],
      BBR_Grund: () => [{ bfeNummer: '5000001' }],
      BBR_Enhed: () => [{ id_lokalId: ENHED, ejerlejlighed: UNIT }],
      BBR_Ejerlejlighed: () => [{ bfeNummer: '7000002' }],
      VUR_Ejendomsvurdering: () => [
        { bfeNummer: '5000001', ejendomsvaerdi: 2_000_000, grundvaerdi: 500_000, vurderingsaar: 2022 },
        { bfeNummer: '5000001', ejendomsvaerdi: 2_200_000, grundvaerdi: 520_000, vurderingsaar: 2024 },
      ],
      ...overrides.data,
    },
    failTemporalFor: overrides.failTemporalFor,
    status: overrides.status,
  });
  const client = createDatafordeler({ apiKey: 'secret-key', throttle: async () => {}, fetchImpl: api.fetchImpl, env: {}, sleep: async () => {} });
  return { client, api };
}

test('redact hides api keys and tokens', () => {
  assert.equal(redact('GET https://x?apiKey=abc123&y=1'), 'GET https://x?apiKey=[redacted]&y=1');
  assert.equal(redact('token=zzz'), 'token=[redacted]');
});

test('pickField prefers exact matches, then the shortest prefix', () => {
  assert.equal(pickField(['bfeNummerLong', 'bfeNummer'], 'bfenummer'), 'bfeNummer');
  assert.equal(pickField(['ejendomsvaerdiBeloeb', 'ejendomsvaerdi2'], 'ejendomsvaerdi'), 'ejendomsvaerdi2');
  assert.equal(pickField(['vurderingsår'], 'vurderingsaar'), 'vurderingsår');
  assert.equal(pickField(['x'], 'bfe'), null);
});

test('positiveInt accepts numeric strings and rejects junk', () => {
  assert.equal(positiveInt('2000000'), 2_000_000);
  assert.equal(positiveInt(1999999.6), 2_000_000);
  assert.equal(positiveInt(0), null);
  assert.equal(positiveInt(-5), null);
  assert.equal(positiveInt('abc'), null);
  assert.equal(positiveInt(null), null);
});

test('parseArgs defaults and validation', () => {
  assert.deepEqual(parseArgs([]), { discover: false, probe: false, write: false, limit: null, rps: 2, soldFirst: true, fixApartmentBfe: false, help: false });
  assert.equal(parseArgs(['--limit', '20', '--write']).limit, 20);
  assert.equal(parseArgs(['--rps', '0.5']).rps, 0.5);
  assert.throws(() => parseArgs(['--limit', '0']), /positive integer/);
  assert.throws(() => parseArgs(['--rps', '50']), /between/);
  assert.throws(() => parseArgs(['--probe', '--write']), /never writes/);
  assert.throws(() => parseArgs(['--discover', '--write']), /cannot be combined/);
  assert.throws(() => parseArgs(['--nope']), /Unknown argument/);
});

test('createThrottle spaces calls by 1/rps', async () => {
  let clock = 0;
  const waits = [];
  const throttle = createThrottle(2, () => clock, async (ms) => { waits.push(ms); clock += ms; });
  await throttle();
  await throttle();
  await throttle();
  assert.deepEqual(waits, [500, 500]);
});

test('pickBfe fails on none and on ambiguity, never guesses', () => {
  const sel = { field: 'bfeNummer', sub: null };
  assert.deepEqual(pickBfe([{ bfeNummer: '123' }, { bfeNummer: 123 }], sel), { ok: true, value: '123' });
  assert.equal(pickBfe([], sel).ok, false);
  assert.match(pickBfe([{ bfeNummer: '1' }, { bfeNummer: '2' }], sel).reason, /ambiguous/);
  assert.equal(pickBfe([{ bfeNummer: 'abc' }], sel).ok, false);
  assert.equal(pickBfe([{ bfe: { nummer: '42' } }], { field: 'bfe', sub: 'nummer' }).value, '42');
});

test('buildValuationRows drops conflicting years and invalid rows', () => {
  const fields = { year: 'y', assessed: 'a', land: 'l' };
  const { rows, conflictYears } = buildValuationRows(
    [
      { y: 2022, a: 100, l: 10 },
      { y: 2022, a: 100, l: 10 }, // identical duplicate is fine
      { y: 2024, a: 200, l: 20 },
      { y: 2024, a: 999, l: 20 }, // conflict
      { y: 1800, a: 1, l: 1 }, // out of range
      { y: 2026, a: null, l: null }, // nothing usable
    ],
    fields,
  );
  assert.deepEqual(rows, [{ valuation_year: 2022, assessed_property_value_dkk: 100, assessed_land_value_dkk: 10 }]);
  assert.equal(conflictYears, 1);
});

test('addressIdsByProperty keeps the newest valid UUID and parses text values', () => {
  const map = addressIdsByProperty([
    { property_id: 'p1', value: { addressId: ADDRESS.toUpperCase() } },
    { property_id: 'p1', value: { addressId: '0b3f50a0-1111-4222-8333-444455556666' } },
    { property_id: 'p2', value: JSON.stringify({ addressId: ADDRESS }) },
    { property_id: 'p3', value: { addressId: 'not-a-uuid' } },
    { property_id: 'p4', value: '{broken' },
  ]);
  assert.equal(map.get('p1'), ADDRESS);
  assert.equal(map.get('p2'), ADDRESS);
  assert.equal(map.has('p3'), false);
  assert.equal(map.has('p4'), false);
});

test('selectCandidates skips complete properties and puts sold ones first', () => {
  const properties = [
    { id: 'a', bfe_nummer: '1', id_lokalid: 'x' },
    { id: 'b', bfe_nummer: null, id_lokalid: null },
    { id: 'c', bfe_nummer: '2', id_lokalid: 'y' },
    { id: 'd', bfe_nummer: null, id_lokalid: null },
  ];
  const valuedIds = new Set(['a']);
  const soldIds = new Set(['d']);
  assert.deepEqual(selectCandidates({ properties, valuedIds, soldIds }).map((p) => p.id), ['d', 'b', 'c']);
  assert.deepEqual(selectCandidates({ properties, valuedIds, soldIds, soldFirst: false }).map((p) => p.id), ['b', 'c', 'd']);
});

test('client walks version segments on 404 and sends the key only as a query parameter', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.includes('/v3?')) return { status: 404, ok: false, headers: new Headers(), json: async () => ({}) };
    return { status: 200, ok: true, headers: new Headers(), json: async () => ({ data: { ok: true } }) };
  };
  const client = createDatafordeler({ apiKey: 'k', throttle: async () => {}, fetchImpl, env: {}, sleep: async () => {} });
  assert.deepEqual(await client.post(SERVICES.DAR, '{ x }'), { ok: true });
  assert.match(urls[0], /DAR\/v3\?apiKey=k$/);
  assert.match(urls[1], /DAR\/v2\?apiKey=k$/);
  await client.post(SERVICES.DAR, '{ x }');
  assert.match(urls[2], /DAR\/v2/); // remembered
});

test('401 is fatal and 5xx is retried', async () => {
  const { client } = makeClient({ status: 401 });
  await assert.rejects(client.post(SERVICES.DAR, '{ x }'), FatalError);

  let n = 0;
  const fetchImpl = async () => (++n < 3
    ? { status: 503, ok: false, headers: new Headers(), json: async () => ({}) }
    : { status: 200, ok: true, headers: new Headers(), json: async () => ({ data: { fine: 1 } }) });
  const retrying = createDatafordeler({ apiKey: 'k', throttle: async () => {}, fetchImpl, env: { DATAFORDELER_DAR_VERSION: 'v3' }, sleep: async () => {} });
  assert.deepEqual(await retrying.post(SERVICES.DAR, '{ x }'), { fine: 1 });
  assert.equal(n, 3);
});

test('house: addressId -> husnummer -> parcel BFE -> valuations, parcel BFE stored on the house', async () => {
  const { client } = makeClient();
  const r = await processProperty(client, { id: 'p1', property_type: 'villa', bfe_nummer: null, id_lokalid: null }, ADDRESS);
  assert.equal(r.outcome, 'ok');
  assert.equal(r.idLokalid, HUSNUMMER);
  assert.equal(r.derivedIdLokalid, true);
  assert.equal(r.bfe, '5000001');
  assert.deepEqual(r.valuations.map((v) => v.valuation_year), [2022, 2024]);
});

test('apartment: ignores a stored parcel BFE and uses the unit BFE, flagging the conflict', async () => {
  const { client } = makeClient({
    data: {
      VUR_Ejendomsvurdering: () => [{ bfeNummer: '7000002', ejendomsvaerdi: 1_500_000, grundvaerdi: 0, vurderingsaar: 2024 }],
    },
  });
  const r = await processProperty(client, { id: 'p2', property_type: 'apartment', bfe_nummer: '5000001', id_lokalid: HUSNUMMER }, ADDRESS);
  assert.equal(r.outcome, 'ok');
  assert.equal(r.bfe, '7000002');
  assert.equal(r.bfeConflict, true);
  assert.deepEqual(r.valuations, [{ valuation_year: 2024, assessed_property_value_dkk: 1_500_000, assessed_land_value_dkk: null }]);
});

test('apartment without ejerlejlighed registration fails soft with a reason', async () => {
  const { client } = makeClient({ data: { BBR_Enhed: () => [{ id_lokalId: ENHED, ejerlejlighed: null }] } });
  const r = await processProperty(client, { id: 'p3', property_type: 'apartment', bfe_nummer: null, id_lokalid: HUSNUMMER }, ADDRESS);
  assert.equal(r.outcome, 'failed');
  assert.match(r.reason, /ejerlejlighed/);
});

test('ambiguous BFE is a failure, not a guess', async () => {
  const { client } = makeClient({ data: { BBR_Grund: () => [{ bfeNummer: '1' }, { bfeNummer: '2' }] } });
  const r = await processProperty(client, { id: 'p4', property_type: 'villa', bfe_nummer: null, id_lokalid: HUSNUMMER }, ADDRESS);
  assert.equal(r.outcome, 'failed');
  assert.match(r.reason, /ambiguous/);
});

test('no addressId and no id_lokalid is skipped', async () => {
  const { client, api } = makeClient();
  const r = await processProperty(client, { id: 'p5', property_type: 'villa', bfe_nummer: null, id_lokalid: null }, undefined);
  assert.equal(r.outcome, 'skipped');
  assert.equal(api.calls.length, 0);
});

test('valuation miss after a derived BFE is partial so the BFE can still be stored', async () => {
  const { client } = makeClient({ data: { VUR_Ejendomsvurdering: () => [] } });
  const r = await processProperty(client, { id: 'p6', property_type: 'villa', bfe_nummer: null, id_lokalid: HUSNUMMER }, ADDRESS);
  assert.equal(r.outcome, 'partial');
  assert.equal(r.bfe, '5000001');
  assert.match(r.reason, /valuation/);
});

test('BBR is queried with bitemporal arguments first, others without, and each falls back on error', async () => {
  const { client, api } = makeClient({ failTemporalFor: new Set(['BBR_Grund']) });
  await processProperty(client, { id: 'p7', property_type: 'villa', bfe_nummer: null, id_lokalid: HUSNUMMER }, ADDRESS);
  const grund = api.calls.filter((c) => c.query.includes('BBR_Grund(')).map((c) => c.query.includes('registreringstid'));
  assert.deepEqual(grund, [true, false]);
  const vur = api.calls.filter((c) => c.query.includes('VUR_Ejendomsvurdering(')).map((c) => c.query.includes('registreringstid'));
  assert.deepEqual(vur, [false]);
});

test('API key never appears in a GraphQL error surfaced to the caller', async () => {
  const fetchImpl = async () => ({ status: 200, ok: true, headers: new Headers(), json: async () => ({ errors: [{ message: 'bad url ?apiKey=SECRET123 here' }] }) });
  const client = createDatafordeler({ apiKey: 'SECRET123', throttle: async () => {}, fetchImpl, env: { DATAFORDELER_DAR_VERSION: 'v3' }, sleep: async () => {} });
  await assert.rejects(client.post(SERVICES.DAR, '{ x }'), (err) => !String(err.message).includes('SECRET123'));
});

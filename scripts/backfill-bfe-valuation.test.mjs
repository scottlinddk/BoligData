import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FatalError,
  GraphQlError,
  SERVICES,
  SMOKE_TARGETS,
  addressIdsByProperty,
  buildValuationRows,
  classifyAddressId,
  createDatafordeler,
  createThrottle,
  discover,
  isoTimestamp,
  parseArgs,
  pickBfe,
  positiveInt,
  processProperty,
  redact,
  resolveValuations,
  selectCandidates,
} from './backfill-bfe-valuation.mjs';

const ADDRESS = '0a3f50a0-1111-4222-8333-444455556666';
const HUSNUMMER = '0a3f50b1-1111-4222-8333-444455556666';
const GRUND = '0a3f50c2-1111-4222-8333-444455556666';
const ENHED = '0a3f50d3-1111-4222-8333-444455556666';
const UNIT = '0a3f50e4-1111-4222-8333-444455556666';

const REL_HOUSE = '0a3f50f5-1111-4222-8333-444455556666';

/** A fake Datafordeler: a handler per entity. Introspection is off on the real service, so there is no schema. */
function fakeApi({ data, failTemporalFor = new Set(), status = 200 }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const query = JSON.parse(init.body).query;
    calls.push({ url, query });
    if (status !== 200) return { status, ok: false, headers: new Headers(), json: async () => ({}) };
    const entity = query.match(/query Q \{ (\w+)/)?.[1];
    const withTime = query.includes('registreringstid');
    if (failTemporalFor.has(entity) && withTime) {
      return { status: 200, ok: true, headers: new Headers(), json: async () => ({ errors: [{ message: 'Unknown argument registreringstid' }] }) };
    }
    const nodes = data[entity] ? data[entity](query) : [];
    return { status: 200, ok: true, headers: new Headers(), json: async () => ({ data: { [entity]: { nodes } } }) };
  };
  return { fetchImpl, calls };
}

const byBfe = (query) => (query.includes('eq: 7000002') ? 'unit' : 'house');

function makeClient(overrides = {}) {
  const api = fakeApi({
    data: {
      DAR_Adresse: () => [{ id_lokalId: ADDRESS, husnummer: HUSNUMMER }],
      BBR_Grund: () => [{ id_lokalId: GRUND, bestemtFastEjendom: REL_HOUSE }],
      BBR_Enhed: () => [{ id_lokalId: ENHED }],
      BBR_EnhedEjendomsrelation: () => [{ ejerlejlighed: UNIT }],
      BBR_Ejendomsrelation: (query) => [{ id_lokalId: query.includes(UNIT) ? UNIT : REL_HOUSE, bfeNummer: query.includes(UNIT) ? 7000002 : 5000001 }],
      VUR_BFEKrydsreference: (query) => (byBfe(query) === 'unit' ? [{ fkEjendomsvurderingID: 21 }] : [{ fkEjendomsvurderingID: 11 }, { fkEjendomsvurderingID: 12 }]),
      VUR_Ejendomsvurdering: () => [
        { id: 11, aar: 2022, ejendomvaerdiBeloeb: 2_000_000, grundvaerdiBeloeb: 500_000 },
        { id: 12, aar: 2024, ejendomvaerdiBeloeb: 2_200_000, grundvaerdiBeloeb: 520_000 },
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
  const { client, api } = makeClient({
    data: {
      VUR_Ejendomsvurdering: () => [{ id: 21, aar: 2024, ejendomvaerdiBeloeb: 1_500_000, grundvaerdiBeloeb: 0 }],
    },
  });
  const r = await processProperty(client, { id: 'p2', property_type: 'apartment', bfe_nummer: '5000001', id_lokalid: HUSNUMMER }, ADDRESS);
  assert.equal(r.outcome, 'ok');
  assert.equal(r.bfe, '7000002');
  assert.equal(r.bfeConflict, true);
  assert.ok(api.calls.some((c) => c.query.includes('VUR_BFEKrydsreference') && c.query.includes('BFEnummer: { eq: 7000002 }')), 'VUR is keyed by the unit BFE');
  assert.deepEqual(r.valuations, [{ valuation_year: 2024, assessed_property_value_dkk: 1_500_000, assessed_land_value_dkk: null }]);
});

test('apartment without ejerlejlighed registration fails soft with a reason', async () => {
  const { client } = makeClient({ data: { BBR_EnhedEjendomsrelation: () => [] } });
  const r = await processProperty(client, { id: 'p3', property_type: 'apartment', bfe_nummer: null, id_lokalid: HUSNUMMER }, ADDRESS);
  assert.equal(r.outcome, 'failed');
  assert.match(r.reason, /ejerlejlighed/);
});

test('ambiguous BFE is a failure, not a guess', async () => {
  const { client } = makeClient({ data: { BBR_Ejendomsrelation: () => [{ bfeNummer: 1 }, { bfeNummer: 2 }] } });
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
  const { client } = makeClient({ data: { VUR_BFEKrydsreference: () => [] } });
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

test('classifyAddressId tells a unit address from an access address', async () => {
  const idIn = (id) => (query) => (query.includes(JSON.stringify(id)) ? [{ id_lokalId: id }] : []);
  const { client } = makeClient({ data: { DAR_Adresse: idIn(ADDRESS), DAR_Husnummer: idIn(HUSNUMMER) } });
  assert.deepEqual(await classifyAddressId(client, ADDRESS), { ok: true, value: 'adresse' });
  assert.deepEqual(await classifyAddressId(client, HUSNUMMER), { ok: true, value: 'husnummer' });
  assert.deepEqual(await classifyAddressId(client, GRUND), { ok: true, value: 'none' });
  assert.equal((await classifyAddressId(client, 'nope')).ok, false);
});

test('buildValuationRows keeps the earliest registration date and omits it when unusable', () => {
  const fields = { year: 'y', assessed: 'a', land: 'l', registered: 'r' };
  const { rows } = buildValuationRows(
    [
      { y: 2022, a: 100, l: 10, r: '2023-05-01T00:00:00Z' },
      { y: 2022, a: 100, l: 10, r: '2022-11-01T00:00:00Z' }, // same value, earlier registration wins
      { y: 2024, a: 200, l: 20, r: 'not a date' },
      { y: 2026, a: 300, l: 30, r: '2999-01-01T00:00:00Z' }, // future date is never "known"
    ],
    fields,
  );
  assert.deepEqual(rows, [
    { valuation_year: 2022, assessed_property_value_dkk: 100, assessed_land_value_dkk: 10, registered_at: '2022-11-01T00:00:00.000Z' },
    { valuation_year: 2024, assessed_property_value_dkk: 200, assessed_land_value_dkk: 20 },
    { valuation_year: 2026, assessed_property_value_dkk: 300, assessed_land_value_dkk: 30 },
  ]);
  assert.equal(isoTimestamp(undefined), null);
});

test('a 400 surfaces the redacted response body so the cause is visible', async () => {
  const fetchImpl = async () => ({
    status: 400,
    ok: false,
    headers: new Headers(),
    text: async () => 'Query depth limit exceeded at https://x/y?apiKey=hunter2',
  });
  const client = createDatafordeler({ apiKey: 'k', throttle: async () => {}, fetchImpl, env: { DATAFORDELER_DAR_VERSION: 'v3' }, sleep: async () => {} });
  await assert.rejects(client.post(SERVICES.DAR, '{ x }'), (err) => {
    assert.match(err.message, /HTTP 400 from Datafordeler: Query depth limit exceeded/);
    assert.doesNotMatch(err.message, /hunter2/);
    return true;
  });
});

test('valuations: numeric BFE, cross-reference ids, real field names and a page size', async () => {
  const { client, api } = makeClient();
  const r = await resolveValuations(client, '5000001');
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.map((v) => [v.valuation_year, v.assessed_property_value_dkk, v.assessed_land_value_dkk]), [[2022, 2_000_000, 500_000], [2024, 2_200_000, 520_000]]);
  const ref = api.calls.find((c) => c.query.includes('VUR_BFEKrydsreference')).query;
  assert.match(ref, /first: 50 where: \{ BFEnummer: \{ eq: 5000001 \} \}/); // Long literal, not a string
  const val = api.calls.find((c) => c.query.includes('VUR_Ejendomsvurdering')).query;
  assert.match(val, /id: \{ in: \[11, 12\] \}/);
  assert.match(val, /aar ejendomvaerdiBeloeb grundvaerdiBeloeb ajourfoeringDato/);
  assert.equal((await resolveValuations(client, 'abc')).ok, false);
});

test('discover reports every smoke target and fails the run when a name is rejected', async () => {
  const lines = [];
  const rejecting = { post: async (_service, query) => { if (query.includes('VUR_Ejendomsvurdering')) throw new GraphQlError(['The field `x` does not exist on the type `VUR_Ejendomsvurdering`.']); return {}; } };
  process.exitCode = undefined;
  await discover(rejecting, (l) => lines.push(l));
  assert.equal(process.exitCode, 1);
  process.exitCode = undefined;
  assert.equal(lines.filter((l) => l.startsWith('OK ')).length, SMOKE_TARGETS.length - 1);
  assert.ok(lines.some((l) => l.startsWith('FAILED VUR_Ejendomsvurdering') && l.includes('does not exist')));

  const lines2 = [];
  await discover({ post: async () => ({}) }, (l) => lines2.push(l));
  assert.equal(process.exitCode, undefined);
  assert.ok(lines2.at(-1).includes('All field names accepted'));
});

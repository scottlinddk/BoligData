import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifySearchBoundary } from './verify-search-boundary.mjs';

test('deployment preflight requires a working public polygon RPC and identifies the missing migration', async t => {
  const env = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-test-key' };
  const request = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.pathname, '/rest/v1/rpc/properties_in_boundary');
    assert.equal(JSON.parse(url.searchParams.get('boundary')).length, 6);
    assert.equal(url.searchParams.get('select'), '*');
    assert.equal(url.searchParams.get('status'), 'eq.active');
    assert.equal(url.searchParams.get('order'), 'listing_date.desc');
    assert.equal(url.searchParams.get('offset'), '0');
    assert.equal(url.searchParams.get('limit'), '1');
    assert.equal(options.method, 'GET');
    assert.deepEqual(options.headers, { apikey: 'public-test-key', Prefer: 'count=exact' });
    return Response.json([], { headers: { 'Content-Range': '*/0' } });
  });
  await verifySearchBoundary(env); // A valid empty search is ready too.
  await assert.rejects(verifySearchBoundary({}), /VITE_SUPABASE_URL/);
  assert.equal(request.mock.callCount(), 1);

  request.mock.mockImplementation(async (url, options) => {
    assert.equal(url.origin, 'https://runtime.supabase.co');
    assert.equal(options.headers.apikey, 'runtime-public-key');
    return Response.json([], { headers: { 'Content-Range': '*/0' } });
  });
  await verifySearchBoundary({ ...env, SUPABASE_URL: 'https://runtime.supabase.co', SUPABASE_ANON_KEY: 'runtime-public-key' });

  request.mock.mockImplementation(async () => Response.json({ code: 'PGRST202' }, { status: 404 }));
  await assert.rejects(verifySearchBoundary(env), /025_property_search_boundary.sql.*before deploying/);
  request.mock.mockImplementation(async () => new Response('unavailable', { status: 503 }));
  await assert.rejects(verifySearchBoundary(env), /HTTP 503/);
  request.mock.mockImplementation(async () => Response.json({}));
  await assert.rejects(verifySearchBoundary(env), /unexpected response/);
  request.mock.mockImplementation(async () => Response.json([]));
  await assert.rejects(verifySearchBoundary(env), /exact count/);
  request.mock.mockImplementation(async () => { throw new TypeError('fetch failed'); });
  await assert.rejects(verifySearchBoundary(env), /could not reach Supabase/);
});

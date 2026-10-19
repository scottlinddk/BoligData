import { pathToFileURL } from 'node:url';

// Exercise the area that exposed the missing production migration. GET calls the
// STABLE RPC without writing data. Match the API's selection, ordering and count;
// retrieve at most one row and never print it.
const boundary = [[9.85936110119053,57.017429404942476],[9.900487958333429,57.013697751323974],[9.921772910714253,57.02940744620204],[9.925380529761696,57.0419704230755],[9.894355005952548,57.05197850453462],[9.870544720238286,57.04648420543148]];

export async function verifySearchBoundary(env = process.env) {
  // Match the API client's runtime overrides before the public build defaults.
  const baseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !key) throw new Error('Drawn-area preflight needs SUPABASE_URL/SUPABASE_ANON_KEY or VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY from the production environment.');
  const url = new URL('/rest/v1/rpc/properties_in_boundary', baseUrl);
  url.search = new URLSearchParams({ boundary: JSON.stringify(boundary), select: '*', status: 'eq.active', order: 'listing_date.desc', offset: '0', limit: '1' });
  const response = await fetch(url, {
    method: 'GET', headers: { apikey: key, Prefer: 'count=exact' }, redirect: 'error', signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new Error('Drawn-area search preflight could not reach Supabase. Check network access and the production Supabase URL before deploying.');
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (body?.code === 'PGRST202' || body?.code === '42883') {
      throw new Error('Drawn-area search RPC is missing. Apply packages/supabase/migrations/025_property_search_boundary.sql to the production Supabase database before deploying; if already applied, reload the PostgREST schema cache and retry.');
    }
    throw new Error(`Drawn-area search preflight failed (HTTP ${response.status}). Check Supabase availability, query compatibility, public credentials and RPC permissions before deploying.`);
  }
  if (!Array.isArray(body)) throw new Error('Drawn-area search preflight returned an unexpected response; deployment stopped.');
  if (!/\/\d+$/.test(response.headers.get('content-range') ?? '')) throw new Error('Drawn-area search preflight did not return an exact count; deployment stopped.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await verifySearchBoundary();
    console.log('Drawn-area search RPC is available for anonymous callers.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

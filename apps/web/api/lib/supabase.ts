import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Client scoped to the calling user's JWT. Postgres RLS (auth.uid() = ...)
 * enforces per-user access — this client never needs the service_role key.
 */
export function getAnonClient(jwt?: string): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in the API runtime environment");
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : undefined,
    auth: { persistSession: false },
  });
}

/**
 * Elevated-privilege client that bypasses RLS. Only used by api/crawl.ts,
 * a system job with no end-user context. Requires SUPABASE_SERVICE_ROLE_KEY
 * to be set in the Vercel project's environment variables (no MCP tool can
 * set this — it must be added manually in the dashboard).
 */
export function getServiceRoleClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — set SUPABASE_SERVICE_ROLE_KEY in the Vercel dashboard",
    );
  }
  return createClient(SUPABASE_URL, serviceRoleKey, { auth: { persistSession: false } });
}

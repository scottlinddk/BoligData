import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "../../../../packages/shared/src/types/index.js";
import { getAnonClient } from "../lib/supabase.js";

// Vercel's per-function type check resolves @supabase/supabase-js in a mode
// where methods SupabaseAuthClient inherits from @supabase/auth-js (getUser
// among them) vanish from the type, breaking the deploy check even though the
// call is fine at runtime. Pin the one method we use to an explicit signature.
type AuthGetUser = {
  getUser(jwt?: string): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
};

function getUser(client: SupabaseClient, jwt: string) {
  return (client.auth as unknown as AuthGetUser).getUser(jwt);
}

export function extractJwt(req: VercelRequest): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length);
}

/**
 * Resolves the calling user from their JWT. Sends 401 and returns null if
 * no valid session is present. Routes that require a signed-in user
 * (searches, alerts) should call this before touching the database.
 */
export async function requireUser(
  req: VercelRequest,
  res: VercelResponse,
): Promise<{ userId: string; jwt: string } | null> {
  const jwt = extractJwt(req);
  if (!jwt) {
    res.status(401).json({ error: "Missing bearer token" });
    return null;
  }
  const client = getAnonClient(jwt);
  const { data, error } = await getUser(client, jwt);
  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return null;
  }
  return { userId: data.user.id, jwt };
}

/**
 * Like requireUser, but for routes that serve both signed-in and anonymous
 * callers different data (e.g. property search). Never sends a response —
 * returns null for "no valid session" so the caller can fall back to the
 * public shape instead of rejecting the request.
 */
export async function getOptionalUser(
  req: VercelRequest,
): Promise<{ userId: string; jwt: string } | null> {
  const jwt = extractJwt(req);
  if (!jwt) return null;
  const client = getAnonClient(jwt);
  const { data, error } = await getUser(client, jwt);
  if (error || !data.user) return null;
  return { userId: data.user.id, jwt };
}

/**
 * Like requireUser, but also resolves the caller's user_profiles.role and
 * 403s unless it's in `allowed`. An app-level gate on top of RLS — routes
 * gated by role (admin/advisor/agent features) should call this instead of
 * requireUser.
 */
export async function requireRole(
  req: VercelRequest,
  res: VercelResponse,
  allowed: UserRole[],
): Promise<{ userId: string; jwt: string; role: UserRole } | null> {
  const auth = await requireUser(req, res);
  if (!auth) return null;
  const client = getAnonClient(auth.jwt);
  const { data, error } = await client
    .from("user_profiles")
    .select("role")
    .eq("id", auth.userId)
    .single();
  if (error || !data) {
    res.status(403).json({ error: "No profile found for this account" });
    return null;
  }
  const role = data.role as UserRole;
  if (!allowed.includes(role)) {
    res.status(403).json({ error: "Insufficient role" });
    return null;
  }
  return { ...auth, role };
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAnonClient } from "../lib/supabase";

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
  const { data, error } = await client.auth.getUser(jwt);
  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return null;
  }
  return { userId: data.user.id, jwt };
}

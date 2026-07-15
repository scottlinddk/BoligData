import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../../server/middleware/cors.js";
import { requireRole } from "../../server/middleware/auth.js";
import { getAnonClient } from "../../server/lib/supabase.js";
import { sendError } from "../../server/lib/http-helpers.js";
import {
  rowToAdvisorConnection,
  rowToFavorite,
  rowToProperty,
} from "../../server/lib/row-mappers.js";

/**
 * Consolidated router for /api/advisor/connections, /api/advisor/favorites,
 * and /api/advisor/listings. One catch-all file instead of one file per
 * route keeps the Vercel serverless function count under the plan limit.
 * Despite the "advisor" path, agents use connections/favorites for their
 * own connected customers — the underlying advisor_connections/favorites
 * tables and RLS policies don't distinguish advisor vs. agent, only "the
 * professional side of a connection" vs. "the customer side". `listings`
 * (an agent's own claimed properties) is agent-only, gated separately below
 * since it doesn't apply to advisors.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await requireRole(req, res, ["advisor", "agent"]);
  if (!auth) return;

  const client = getAnonClient(auth.jwt);
  res.setHeader("Cache-Control", "no-store");

  const raw = req.query.path;
  const [resource, ...rest] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (rest.length > 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (resource === "connections") {
    const { data, error } = await client
      .from("advisor_connections")
      .select("*")
      .eq("advisor_id", auth.userId)
      .order("created_at", { ascending: false });
    if (error) {
      sendError(res, 500, "Failed to load connections", error);
      return;
    }
    res.status(200).json({ connections: (data ?? []).map(rowToAdvisorConnection) });
    return;
  }

  if (resource === "listings") {
    if (auth.role !== "agent") {
      res.status(403).json({ error: "Insufficient role" });
      return;
    }
    // properties has public-read RLS, so the anon (JWT-scoped) client is fine here.
    const { data, error } = await client
      .from("properties")
      .select("*")
      .eq("agent_user_id", auth.userId)
      .order("listing_date", { ascending: false });
    if (error) {
      sendError(res, 500, "Failed to load listings", error);
      return;
    }
    res.status(200).json({ properties: (data ?? []).map((row) => rowToProperty(row)) });
    return;
  }

  if (resource === "favorites") {
    // RLS's favorites_select_own_or_advisor policy already scopes this to the
    // caller's own favorites (none, for an advisor) plus their connected users'.
    const { data, error } = await client
      .from("favorites")
      .select("*, properties(*)")
      .order("created_at", { ascending: false });
    if (error) {
      sendError(res, 500, "Failed to load connected users' favorites", error);
      return;
    }
    const rows = data ?? [];
    res.status(200).json({
      favorites: rows.map(rowToFavorite),
      properties: rows.filter((r) => r.properties).map((r) => rowToProperty(r.properties)),
    });
    return;
  }

  res.status(404).json({ error: "Not found" });
}

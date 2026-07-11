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
 * Consolidated router for /api/advisor/connections and /api/advisor/favorites.
 * One catch-all file instead of one file per route keeps the Vercel
 * serverless function count under the plan limit.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await requireRole(req, res, ["advisor"]);
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

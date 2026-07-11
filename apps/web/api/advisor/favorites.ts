import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../../server/middleware/cors.js";
import { requireRole } from "../../server/middleware/auth.js";
import { getAnonClient } from "../../server/lib/supabase.js";
import { sendError } from "../../server/lib/http-helpers.js";
import { rowToFavorite, rowToProperty } from "../../server/lib/row-mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await requireRole(req, res, ["advisor"]);
  if (!auth) return;

  // RLS's favorites_select_own_or_advisor policy already scopes this to the
  // caller's own favorites (none, for an advisor) plus their connected users'.
  const client = getAnonClient(auth.jwt);
  res.setHeader("Cache-Control", "no-store");
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
}

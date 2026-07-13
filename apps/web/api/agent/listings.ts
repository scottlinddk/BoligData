import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../../server/middleware/cors.js";
import { requireRole } from "../../server/middleware/auth.js";
import { getAnonClient } from "../../server/lib/supabase.js";
import { sendError } from "../../server/lib/http-helpers.js";
import { rowToProperty } from "../../server/lib/row-mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await requireRole(req, res, ["agent"]);
  if (!auth) return;

  // properties has public-read RLS, so the anon (JWT-scoped) client is fine here.
  const client = getAnonClient(auth.jwt);
  res.setHeader("Cache-Control", "no-store");
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
}

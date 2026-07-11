import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../server/middleware/cors.js";
import { requireUser } from "../server/middleware/auth.js";
import { getAnonClient } from "../server/lib/supabase.js";
import { sendError } from "../server/lib/http-helpers.js";
import { rowToNotification } from "../server/lib/row-mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await requireUser(req, res);
  if (!auth) return;
  const client = getAnonClient(auth.jwt);
  res.setHeader("Cache-Control", "no-store");

  let query = client
    .from("notifications")
    .select("*")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false });
  if (req.query.unreadOnly === "true") {
    query = query.is("read_at", null);
  }

  const { data, error } = await query;
  if (error) {
    sendError(res, 500, "Failed to load notifications", error);
    return;
  }
  res.status(200).json({ notifications: (data ?? []).map(rowToNotification) });
}

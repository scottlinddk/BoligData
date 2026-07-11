import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../../../server/middleware/cors.js";
import { requireUser } from "../../../server/middleware/auth.js";
import { getAnonClient } from "../../../server/lib/supabase.js";
import { isUuid, sendError } from "../../../server/lib/http-helpers.js";
import { rowToNotification } from "../../../server/lib/row-mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "PATCH") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await requireUser(req, res);
  if (!auth) return;

  const id = req.query.id;
  if (!isUuid(id)) {
    sendError(res, 400, "Invalid notification id");
    return;
  }

  const client = getAnonClient(auth.jwt);
  res.setHeader("Cache-Control", "no-store");
  const { data, error } = await client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select("*")
    .single();

  if (error || !data) {
    sendError(res, 404, "Notification not found", error ?? undefined);
    return;
  }
  res.status(200).json(rowToNotification(data));
}

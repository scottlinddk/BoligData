import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { NotificationType } from "../../../packages/shared/src/types/index.js";
import { applyCors } from "../server/middleware/cors.js";
import { requireUser } from "../server/middleware/auth.js";
import { getAnonClient } from "../server/lib/supabase.js";
import { isUuid, sendError } from "../server/lib/http-helpers.js";
import { rowToNotification } from "../server/lib/row-mappers.js";

const NOTIFICATION_TYPES: NotificationType[] = [
  "new_listing",
  "price_drop",
  "message",
  "data_update",
  "system",
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const auth = await requireUser(req, res);
  if (!auth) return;
  const client = getAnonClient(auth.jwt);
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    let query = client
      .from("notifications")
      .select("*")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false });
    if (req.query.unreadOnly === "true") {
      query = query.is("read_at", null);
    }
    const type = req.query.type;
    if (typeof type === "string" && NOTIFICATION_TYPES.includes(type as NotificationType)) {
      query = query.eq("type", type);
    }

    const { data, error } = await query;
    if (error) {
      sendError(res, 500, "Failed to load notifications", error);
      return;
    }
    res.status(200).json({ notifications: (data ?? []).map(rowToNotification) });
    return;
  }

  // PATCH /api/notifications?id=<uuid> — mark a notification read. (Was
  // PATCH /api/notifications/:id/read; folded in here to stay under
  // Vercel's serverless function count limit.)
  if (req.method === "PATCH") {
    const id = req.query.id;
    if (!isUuid(id)) {
      sendError(res, 400, "Invalid notification id");
      return;
    }
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
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

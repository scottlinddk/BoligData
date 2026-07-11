import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../../../server/middleware/cors.js";
import { requireRole } from "../../../server/middleware/auth.js";
import { getServiceRoleClient } from "../../../server/lib/supabase.js";
import { isUuid, sendError } from "../../../server/lib/http-helpers.js";
import { rowToProperty } from "../../../server/lib/row-mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST" && req.method !== "DELETE") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await requireRole(req, res, ["agent", "admin"]);
  if (!auth) return;

  const id = req.query.id;
  if (!isUuid(id)) {
    sendError(res, 400, "Invalid property id");
    return;
  }

  const client = getServiceRoleClient();
  res.setHeader("Cache-Control", "no-store");

  let query = client.from("properties").select("id").eq("id", id);
  if (auth.role === "agent") query = query.eq("agent_user_id", auth.userId);
  const { data: existing, error: lookupError } = await query.maybeSingle();
  if (lookupError || !existing) {
    sendError(res, 403, "Listing not found or not associated with your account", lookupError ?? undefined);
    return;
  }

  const update =
    req.method === "POST"
      ? { is_promoted: true, promoted_at: new Date().toISOString(), promoted_by: auth.userId }
      : { is_promoted: false, promoted_at: null, promoted_by: null };

  const { data, error } = await client
    .from("properties")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    sendError(res, 500, "Failed to update promotion status", error ?? undefined);
    return;
  }
  res.status(200).json(rowToProperty(data));
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../../../server/middleware/cors.js";
import { requireRole } from "../../../server/middleware/auth.js";
import { getServiceRoleClient } from "../../../server/lib/supabase.js";
import { isUuid, sendError } from "../../../server/lib/http-helpers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "DELETE") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await requireRole(req, res, ["admin"]);
  if (!auth) return;

  const id = req.query.id;
  if (!isUuid(id)) {
    sendError(res, 400, "Invalid connection id");
    return;
  }

  const client = getServiceRoleClient();
  res.setHeader("Cache-Control", "no-store");
  const { error } = await client.from("advisor_connections").delete().eq("id", id);
  if (error) {
    sendError(res, 500, "Failed to remove connection", error);
    return;
  }
  res.status(204).end();
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../../../server/middleware/cors.js";
import { requireRole } from "../../../server/middleware/auth.js";
import { getServiceRoleClient } from "../../../server/lib/supabase.js";
import { isUuid, sendError } from "../../../server/lib/http-helpers.js";
import { rowToInvitation } from "../../../server/lib/row-mappers.js";

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
    sendError(res, 400, "Invalid invitation id");
    return;
  }

  const client = getServiceRoleClient();
  res.setHeader("Cache-Control", "no-store");
  const { data, error } = await client
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .single();

  if (error || !data) {
    sendError(res, 404, "Pending invitation not found", error ?? undefined);
    return;
  }

  res.status(200).json(rowToInvitation(data));
}

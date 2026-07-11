import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../../../server/middleware/cors.js";
import { requireRole } from "../../../server/middleware/auth.js";
import { getServiceRoleClient } from "../../../server/lib/supabase.js";
import { isUuid, sendError } from "../../../server/lib/http-helpers.js";
import { rowToProperty } from "../../../server/lib/row-mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await requireRole(req, res, ["agent"]);
  if (!auth) return;

  const id = req.query.id;
  if (!isUuid(id)) {
    sendError(res, 400, "Invalid property id");
    return;
  }

  // properties has no RLS write policy (writes are service-role-only), so
  // this is enforced here rather than by Postgres: first-claim-wins, only
  // when unclaimed.
  const client = getServiceRoleClient();
  res.setHeader("Cache-Control", "no-store");
  const { data, error } = await client
    .from("properties")
    .update({ agent_user_id: auth.userId })
    .eq("id", id)
    .is("agent_user_id", null)
    .select("*")
    .single();

  if (error || !data) {
    sendError(res, 409, "Listing not found or already claimed by another agent", error ?? undefined);
    return;
  }
  res.status(200).json(rowToProperty(data));
}

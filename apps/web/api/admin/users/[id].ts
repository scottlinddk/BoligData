import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { UpdateAdminUserBody } from "../../../../../packages/shared/src/types/api.js";
import { applyCors } from "../../../server/middleware/cors.js";
import { requireRole } from "../../../server/middleware/auth.js";
import { getServiceRoleClient } from "../../../server/lib/supabase.js";
import { isUuid, sendError } from "../../../server/lib/http-helpers.js";
import { rowToAdminUser } from "../../../server/lib/row-mappers.js";

const ROLES = ["admin", "user", "advisor", "agent"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "PATCH") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await requireRole(req, res, ["admin"]);
  if (!auth) return;

  const id = req.query.id;
  if (!isUuid(id)) {
    sendError(res, 400, "Invalid user id");
    return;
  }

  const body = req.body as UpdateAdminUserBody;
  if (body.role !== undefined && !ROLES.includes(body.role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }

  const update: Record<string, unknown> = {};
  if (body.role !== undefined) update.role = body.role;
  if (body.organizationName !== undefined) update.organization_name = body.organizationName;
  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const client = getServiceRoleClient();
  res.setHeader("Cache-Control", "no-store");
  const { data, error } = await client
    .from("user_profiles")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    sendError(res, 404, "User not found", error ?? undefined);
    return;
  }

  const { data: authUser } = await client.auth.admin.getUserById(id);
  res.status(200).json(rowToAdminUser({ ...data, email: authUser?.user?.email ?? "" }));
}

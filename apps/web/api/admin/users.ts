import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../../server/middleware/cors.js";
import { requireRole } from "../../server/middleware/auth.js";
import { getAuthAdmin, getServiceRoleClient } from "../../server/lib/supabase.js";
import { sendError } from "../../server/lib/http-helpers.js";
import { rowToAdminUser } from "../../server/lib/row-mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await requireRole(req, res, ["admin"]);
  if (!auth) return;

  const client = getServiceRoleClient();
  res.setHeader("Cache-Control", "no-store");

  const [{ data: profiles, error: profilesError }, { data: userList, error: usersError }] =
    await Promise.all([
      client.from("user_profiles").select("*").order("created_at", { ascending: false }),
      getAuthAdmin(client).listUsers({ perPage: 1000 }),
    ]);

  if (profilesError || usersError) {
    sendError(res, 500, "Failed to load users", profilesError ?? usersError);
    return;
  }

  const emailById = new Map(userList.users.map((u) => [u.id, u.email ?? ""]));
  const users = (profiles ?? []).map((row) =>
    rowToAdminUser({ ...row, email: emailById.get(row.id) ?? "" }),
  );

  res.status(200).json({ users });
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { MyConnection } from "../../../packages/shared/src/types/api.js";
import { applyCors } from "../server/middleware/cors.js";
import { requireUser } from "../server/middleware/auth.js";
import { getAuthAdmin, getServiceRoleClient } from "../server/lib/supabase.js";
import { sendError } from "../server/lib/http-helpers.js";

/**
 * GET /api/connections — the caller's own advisor/agent<->customer
 * connections, from whichever side they're on, with the other party's email
 * and role resolved so the frontend can show a real contact card instead of
 * a bare UUID.
 *
 * advisor_connections rows are already readable by either party via RLS
 * (advisor_connections_select_party), but emails live in auth.users, which
 * PostgREST doesn't expose to the anon client — hence the service-role
 * lookup here. To avoid turning that into a privilege escalation, the query
 * is manually scoped to rows where the caller is advisor_id or user_id;
 * nothing here lets a caller see connections they aren't a party to.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await requireUser(req, res);
  if (!auth) return;

  let client;
  try {
    client = getServiceRoleClient();
  } catch (err) {
    sendError(res, 500, "Connections API is not configured (missing service role credentials)", err);
    return;
  }
  res.setHeader("Cache-Control", "no-store");

  const { data, error } = await client
    .from("advisor_connections")
    .select("*")
    .or(`advisor_id.eq.${auth.userId},user_id.eq.${auth.userId}`)
    .order("created_at", { ascending: false });
  if (error) {
    sendError(res, 500, "Failed to load connections", error);
    return;
  }
  const rows = (data ?? []) as Record<string, any>[];

  const otherIds: string[] = Array.from(
    new Set(rows.map((row) => (row.advisor_id === auth.userId ? row.user_id : row.advisor_id) as string)),
  );
  if (otherIds.length === 0) {
    res.status(200).json({ connections: [] });
    return;
  }

  const [{ data: profilesData, error: profilesError }, authUsers] = await Promise.all([
    client.from("user_profiles").select("*").in("id", otherIds),
    Promise.all(otherIds.map((id) => getAuthAdmin(client).getUserById(id))),
  ]);
  if (profilesError) {
    sendError(res, 500, "Failed to load connection details", profilesError);
    return;
  }
  const profiles = (profilesData ?? []) as Record<string, any>[];

  const emailById = new Map(otherIds.map((id, i) => [id, authUsers[i]?.data.user?.email ?? ""]));
  const profileById = new Map(profiles.map((p) => [p.id as string, p]));

  const connections: MyConnection[] = rows.map((row) => {
    const isCallerAdvisor = row.advisor_id === auth.userId;
    const otherUserId: string = isCallerAdvisor ? row.user_id : row.advisor_id;
    const otherProfile = profileById.get(otherUserId);
    return {
      id: row.id,
      direction: isCallerAdvisor ? "client" : "professional",
      otherUserId,
      otherUserEmail: emailById.get(otherUserId) ?? "",
      otherUserRole: otherProfile?.role ?? "user",
      otherUserOrganizationName: otherProfile?.organization_name ?? null,
      createdAt: row.created_at,
    };
  });

  res.status(200).json({ connections });
}

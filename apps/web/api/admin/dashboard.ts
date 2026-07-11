import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { UserRole } from "../../../../packages/shared/src/types/index.js";
import type { AdminDashboardResponse } from "../../../../packages/shared/src/types/api.js";
import { applyCors } from "../../server/middleware/cors.js";
import { requireRole } from "../../server/middleware/auth.js";
import { getServiceRoleClient } from "../../server/lib/supabase.js";
import { sendError } from "../../server/lib/http-helpers.js";

const ROLES: UserRole[] = ["admin", "user", "advisor", "agent"];

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

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [pendingInvitations, profiles, promotedListings, recentApprovals] = await Promise.all([
    client.from("invitations").select("id", { count: "exact", head: true }).eq("status", "pending"),
    client.from("user_profiles").select("role"),
    client.from("properties").select("id", { count: "exact", head: true }).eq("is_promoted", true),
    client
      .from("listing_approvals")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
  ]);

  if (pendingInvitations.error || profiles.error || promotedListings.error || recentApprovals.error) {
    sendError(
      res,
      500,
      "Failed to load dashboard summary",
      pendingInvitations.error ?? profiles.error ?? promotedListings.error ?? recentApprovals.error,
    );
    return;
  }

  const usersByRole = ROLES.reduce(
    (acc, role) => ({ ...acc, [role]: 0 }),
    {} as Record<UserRole, number>,
  );
  for (const row of profiles.data ?? []) {
    const role = row.role as UserRole;
    usersByRole[role] = (usersByRole[role] ?? 0) + 1;
  }

  const body: AdminDashboardResponse = {
    pendingInvitations: pendingInvitations.count ?? 0,
    usersByRole,
    promotedListings: promotedListings.count ?? 0,
    recentApprovals: recentApprovals.count ?? 0,
  };
  res.status(200).json(body);
}

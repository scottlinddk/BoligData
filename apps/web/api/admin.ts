import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "../../../packages/shared/src/types/index.js";
import type {
  AdminDashboardResponse,
  CreateAdvisorConnectionBody,
  CreateInvitationBody,
  UpdateAdminUserBody,
} from "../../../packages/shared/src/types/api.js";
import { applyCors } from "../server/middleware/cors.js";
import { requireRole } from "../server/middleware/auth.js";
import { getAuthAdmin, getServiceRoleClient } from "../server/lib/supabase.js";
import { isUuid, sendError } from "../server/lib/http-helpers.js";
import {
  rowToAdminUser,
  rowToAdvisorConnection,
  rowToInvitation,
} from "../server/lib/row-mappers.js";

const ROLES: UserRole[] = ["admin", "user", "advisor", "agent"];

/**
 * Emails on this domain are "mock" test accounts: inviting one creates the
 * auth user immediately (email pre-confirmed, fixed password below) instead
 * of sending a real invitation email, and the invitation row is marked
 * accepted right away. Lets an admin stamp out test users for every role
 * without a real inbox.
 */
const MOCK_EMAIL_DOMAIN = "@test.com";
const MOCK_USER_PASSWORD = "test1234";

function str(v: unknown): string | undefined {
  return Array.isArray(v) ? v[0] : (v as string | undefined);
}

/**
 * Consolidated router for every /api/admin/* action. A flat file with
 * query-param sub-routing (?resource=users&id=...) instead of a
 * [...path].ts catch-all folder — Vercel's file-based routing doesn't
 * reliably populate req.query.path for a folder catch-all in production
 * (see the api/properties/[...path].ts fix), so this mirrors the query-param
 * pattern already used by searches.ts/favorites.ts/properties.ts. Routes:
 *
 *   GET    /api/admin?resource=invitations
 *   POST   /api/admin?resource=invitations
 *   POST   /api/admin?resource=invitations&id=:id (resend)
 *   DELETE /api/admin?resource=invitations&id=:id
 *   GET    /api/admin?resource=users
 *   PATCH  /api/admin?resource=users&id=:id
 *   GET    /api/admin?resource=advisor-connections
 *   POST   /api/admin?resource=advisor-connections
 *   DELETE /api/admin?resource=advisor-connections&id=:id
 *   GET    /api/admin?resource=dashboard
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const auth = await requireRole(req, res, ["admin"]);
  if (!auth) return;
  let client: SupabaseClient;
  try {
    client = getServiceRoleClient();
  } catch (err) {
    sendError(res, 500, "Admin API is not configured (missing service role credentials)", err);
    return;
  }
  res.setHeader("Cache-Control", "no-store");

  const resource = str(req.query.resource);
  const id = str(req.query.id);

  switch (resource) {
    case "invitations":
      await handleInvitations(req, res, client, auth.userId, id);
      return;
    case "users":
      await handleUsers(req, res, client, auth.userId, id);
      return;
    case "advisor-connections":
      await handleAdvisorConnections(req, res, client, auth.userId, id);
      return;
    case "dashboard":
      if (id !== undefined || req.method !== "GET") break;
      await handleDashboard(res, client);
      return;
  }
  res.status(404).json({ error: "Not found" });
}

async function handleInvitations(
  req: VercelRequest,
  res: VercelResponse,
  client: SupabaseClient,
  adminUserId: string,
  id: string | undefined,
) {
  if (req.method === "GET" && id === undefined) {
    const { data, error } = await client
      .from("invitations")
      .select("*")
      .order("invited_at", { ascending: false });
    if (error) {
      sendError(res, 500, "Failed to load invitations", error);
      return;
    }
    res.status(200).json({ invitations: (data ?? []).map(rowToInvitation) });
    return;
  }

  if (req.method === "POST" && id === undefined) {
    const body = req.body as CreateInvitationBody;
    const email = body?.email?.trim().toLowerCase();
    if (!email || !body.role || !ROLES.includes(body.role)) {
      res.status(400).json({ error: "email and a valid role are required" });
      return;
    }

    const { data: invitation, error: insertError } = await client
      .from("invitations")
      .insert({ email, role: body.role, invited_by: adminUserId })
      .select("*")
      .single();
    if (insertError || !invitation) {
      if (insertError?.code === "23505") {
        sendError(res, 409, "An invitation for this email is already pending", insertError);
      } else {
        sendError(res, 500, "Failed to create invitation", insertError ?? undefined);
      }
      return;
    }

    if (email.endsWith(MOCK_EMAIL_DOMAIN)) {
      // Mock account: create the user directly (pre-confirmed, fixed test
      // password) instead of emailing an invite. handle_new_user() picks up
      // the pending invitation row above and assigns its role; the
      // confirmed-email trigger never fires for pre-confirmed inserts, so
      // the invitation is marked accepted explicitly here.
      const { error: createError } = await getAuthAdmin(client).createUser({
        email,
        password: MOCK_USER_PASSWORD,
        email_confirm: true,
      });
      if (createError) {
        await client.from("invitations").delete().eq("id", invitation.id);
        sendError(res, 500, "Failed to create mock user", createError);
        return;
      }
      const { data: accepted, error: acceptError } = await client
        .from("invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", invitation.id)
        .select("*")
        .single();
      if (acceptError || !accepted) {
        sendError(res, 500, "Mock user created but failed to mark invitation accepted", acceptError ?? undefined);
        return;
      }
      res.status(201).json(rowToInvitation(accepted));
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL;
    const { error: inviteError } = await getAuthAdmin(client).inviteUserByEmail(email, {
      redirectTo: frontendUrl ? `${frontendUrl}/auth/update-password` : undefined,
    });
    if (inviteError) {
      // Roll back the tracking row so the email can be retried cleanly.
      await client.from("invitations").delete().eq("id", invitation.id);
      sendError(res, 500, "Failed to send invitation email", inviteError);
      return;
    }

    res.status(201).json(rowToInvitation(invitation));
    return;
  }

  if (req.method === "POST" && id !== undefined) {
    if (!isUuid(id)) {
      sendError(res, 400, "Invalid invitation id");
      return;
    }
    const { data: invitation, error: fetchError } = await client
      .from("invitations")
      .select("*")
      .eq("id", id)
      .eq("status", "pending")
      .single();
    if (fetchError || !invitation) {
      sendError(res, 404, "Pending invitation not found", fetchError ?? undefined);
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL;
    const { error: inviteError } = await getAuthAdmin(client).inviteUserByEmail(invitation.email, {
      redirectTo: frontendUrl ? `${frontendUrl}/auth/update-password` : undefined,
    });
    if (inviteError) {
      sendError(res, 500, "Failed to resend invitation email", inviteError);
      return;
    }

    const { data: updated, error: updateError } = await client
      .from("invitations")
      .update({ invited_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (updateError || !updated) {
      sendError(res, 500, "Failed to update invitation", updateError ?? undefined);
      return;
    }
    res.status(200).json(rowToInvitation(updated));
    return;
  }

  if (req.method === "DELETE" && id !== undefined) {
    if (!isUuid(id)) {
      sendError(res, 400, "Invalid invitation id");
      return;
    }
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
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

async function handleUsers(
  req: VercelRequest,
  res: VercelResponse,
  client: SupabaseClient,
  adminUserId: string,
  id: string | undefined,
) {
  if (req.method === "GET" && id === undefined) {
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
    const confirmedById = new Map(userList.users.map((u) => [u.id, u.email_confirmed_at ?? null]));
    const users = (profiles ?? []).map((row) =>
      rowToAdminUser({
        ...row,
        email: emailById.get(row.id) ?? "",
        email_confirmed_at: confirmedById.get(row.id) ?? null,
      }),
    );
    res.status(200).json({ users });
    return;
  }

  if (req.method === "PATCH" && id !== undefined) {
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
    const { data: authUser } = await getAuthAdmin(client).getUserById(id);
    res.status(200).json(
      rowToAdminUser({
        ...data,
        email: authUser?.user?.email ?? "",
        email_confirmed_at: authUser?.user?.email_confirmed_at ?? null,
      }),
    );
    return;
  }

  if (req.method === "DELETE" && id !== undefined) {
    if (!isUuid(id)) {
      sendError(res, 400, "Invalid user id");
      return;
    }
    if (id === adminUserId) {
      res.status(400).json({ error: "You cannot remove your own account" });
      return;
    }
    // Deleting the auth user cascades to user_profiles, favorites, saved
    // searches, notifications, and advisor connections (all FK on delete
    // cascade), so this is the whole removal.
    const { error } = await getAuthAdmin(client).deleteUser(id);
    if (error) {
      const status = (error as { status?: number }).status === 404 ? 404 : 500;
      sendError(res, status, status === 404 ? "User not found" : "Failed to remove user", error);
      return;
    }
    res.status(204).end();
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

/**
 * Despite the "advisor" naming (kept for backwards compatibility with the
 * advisor_connections table/column names), this pairs any professional
 * account — advisor or agent — with a customer account.
 */
async function handleAdvisorConnections(
  req: VercelRequest,
  res: VercelResponse,
  client: SupabaseClient,
  adminUserId: string,
  id: string | undefined,
) {
  if (req.method === "GET" && id === undefined) {
    const { data, error } = await client
      .from("advisor_connections")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      sendError(res, 500, "Failed to load advisor connections", error);
      return;
    }
    res.status(200).json({ connections: (data ?? []).map(rowToAdvisorConnection) });
    return;
  }

  if (req.method === "POST" && id === undefined) {
    const body = req.body as CreateAdvisorConnectionBody;
    if (!body?.advisorId || !body?.userId) {
      res.status(400).json({ error: "advisorId and userId are required" });
      return;
    }
    const [{ data: advisorProfile }, { data: userProfile }] = await Promise.all([
      client.from("user_profiles").select("role").eq("id", body.advisorId).single(),
      client.from("user_profiles").select("role").eq("id", body.userId).single(),
    ]);
    if (advisorProfile?.role !== "advisor" && advisorProfile?.role !== "agent") {
      res.status(400).json({ error: "advisorId does not belong to an advisor or agent account" });
      return;
    }
    if (!userProfile) {
      res.status(400).json({ error: "userId does not exist" });
      return;
    }
    const { data, error } = await client
      .from("advisor_connections")
      .insert({ advisor_id: body.advisorId, user_id: body.userId, created_by: adminUserId })
      .select("*")
      .single();
    if (error || !data) {
      sendError(res, 409, "This connection already exists", error ?? undefined);
      return;
    }
    res.status(201).json(rowToAdvisorConnection(data));
    return;
  }

  if (req.method === "DELETE" && id !== undefined) {
    if (!isUuid(id)) {
      sendError(res, 400, "Invalid connection id");
      return;
    }
    const { error } = await client.from("advisor_connections").delete().eq("id", id);
    if (error) {
      sendError(res, 500, "Failed to remove connection", error);
      return;
    }
    res.status(204).end();
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

async function handleDashboard(res: VercelResponse, client: SupabaseClient) {
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

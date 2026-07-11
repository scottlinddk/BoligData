import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { CreateInvitationBody } from "../../../../packages/shared/src/types/api.js";
import { applyCors } from "../../server/middleware/cors.js";
import { requireRole } from "../../server/middleware/auth.js";
import { getAuthAdmin, getServiceRoleClient } from "../../server/lib/supabase.js";
import { sendError } from "../../server/lib/http-helpers.js";
import { rowToInvitation } from "../../server/lib/row-mappers.js";

const ROLES = ["admin", "user", "advisor", "agent"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const auth = await requireRole(req, res, ["admin"]);
  if (!auth) return;
  const client = getServiceRoleClient();
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
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

  if (req.method === "POST") {
    const body = req.body as CreateInvitationBody;
    const email = body?.email?.trim().toLowerCase();
    if (!email || !body.role || !ROLES.includes(body.role)) {
      res.status(400).json({ error: "email and a valid role are required" });
      return;
    }

    const { data: invitation, error: insertError } = await client
      .from("invitations")
      .insert({ email, role: body.role, invited_by: auth.userId })
      .select("*")
      .single();
    if (insertError || !invitation) {
      sendError(res, 409, "An invitation for this email is already pending", insertError ?? undefined);
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

  res.status(405).json({ error: "Method not allowed" });
}

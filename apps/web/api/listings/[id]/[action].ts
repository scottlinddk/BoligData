import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "../../../../../packages/shared/src/types/index.js";
import type { ApproveListingBody } from "../../../../../packages/shared/src/types/api.js";
import { applyCors } from "../../../server/middleware/cors.js";
import { requireRole } from "../../../server/middleware/auth.js";
import { getAnonClient, getServiceRoleClient } from "../../../server/lib/supabase.js";
import { isUuid, sendError } from "../../../server/lib/http-helpers.js";
import { rowToListingApproval, rowToProperty } from "../../../server/lib/row-mappers.js";

/**
 * Consolidated router for the per-listing role actions. One dynamic file
 * instead of one file per action keeps the Vercel serverless function count
 * under the plan limit. Routes:
 *
 *   POST/DELETE /api/listings/:id/approve  (advisor)
 *   POST        /api/listings/:id/claim    (agent)
 *   POST/DELETE /api/listings/:id/promote  (agent owner, or admin)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const id = req.query.id;
  if (!isUuid(id)) {
    sendError(res, 400, "Invalid property id");
    return;
  }

  switch (req.query.action) {
    case "approve":
      await handleApprove(req, res, id);
      return;
    case "claim":
      await handleClaim(req, res, id);
      return;
    case "promote":
      await handlePromote(req, res, id);
      return;
  }
  res.status(404).json({ error: "Not found" });
}

async function handleApprove(req: VercelRequest, res: VercelResponse, propertyId: string) {
  const auth = await requireRole(req, res, ["advisor"]);
  if (!auth) return;

  const client = getAnonClient(auth.jwt);
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "POST") {
    const body = req.body as ApproveListingBody;
    if (!isUuid(body?.userId)) {
      res.status(400).json({ error: "userId is required" });
      return;
    }
    const { data, error } = await client
      .from("listing_approvals")
      .insert({
        property_id: propertyId,
        advisor_id: auth.userId,
        user_id: body.userId,
        note: body.note ?? null,
      })
      .select("*")
      .single();
    if (error || !data) {
      sendError(res, 403, "Not connected to this user, or already approved", error ?? undefined);
      return;
    }
    res.status(201).json(rowToListingApproval(data));
    return;
  }

  if (req.method === "DELETE") {
    const userId = req.query.userId;
    if (!isUuid(userId)) {
      res.status(400).json({ error: "userId query param is required" });
      return;
    }
    const { error } = await client
      .from("listing_approvals")
      .delete()
      .eq("property_id", propertyId)
      .eq("advisor_id", auth.userId)
      .eq("user_id", userId);
    if (error) {
      sendError(res, 500, "Failed to remove approval", error);
      return;
    }
    res.status(204).end();
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

async function handleClaim(req: VercelRequest, res: VercelResponse, propertyId: string) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await requireRole(req, res, ["agent"]);
  if (!auth) return;

  // properties has no RLS write policy (writes are service-role-only), so
  // this is enforced here rather than by Postgres: first-claim-wins, only
  // when unclaimed.
  const client = getServiceRoleClient();
  res.setHeader("Cache-Control", "no-store");
  const { data, error } = await client
    .from("properties")
    .update({ agent_user_id: auth.userId })
    .eq("id", propertyId)
    .is("agent_user_id", null)
    .select("*")
    .single();

  if (error || !data) {
    sendError(res, 409, "Listing not found or already claimed by another agent", error ?? undefined);
    return;
  }
  res.status(200).json(rowToProperty(data));
}

async function handlePromote(req: VercelRequest, res: VercelResponse, propertyId: string) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await requireRole(req, res, ["agent", "admin"]);
  if (!auth) return;

  const client: SupabaseClient = getServiceRoleClient();
  res.setHeader("Cache-Control", "no-store");

  let query = client.from("properties").select("id").eq("id", propertyId);
  if ((auth.role as UserRole) === "agent") query = query.eq("agent_user_id", auth.userId);
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
    .eq("id", propertyId)
    .select("*")
    .single();

  if (error || !data) {
    sendError(res, 500, "Failed to update promotion status", error ?? undefined);
    return;
  }
  res.status(200).json(rowToProperty(data));
}

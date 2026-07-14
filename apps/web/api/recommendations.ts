import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { CreateRecommendationsBody, RespondRecommendationBody } from "../../../packages/shared/src/types/api.js";
import { applyCors } from "../server/middleware/cors.js";
import { requireRole, requireUser } from "../server/middleware/auth.js";
import { getAnonClient } from "../server/lib/supabase.js";
import { isUuid, sendError } from "../server/lib/http-helpers.js";
import { rowToListingRecommendation, rowToProperty } from "../server/lib/row-mappers.js";

/**
 * GET    /api/recommendations?direction=sent|received
 * POST   /api/recommendations
 * PATCH  /api/recommendations?id=<uuid>
 *
 * RLS (listing_recommendations_select_party) already scopes reads to rows
 * where the caller is advisor_id or user_id, so GET just picks which side of
 * that pair to filter by; it never needs the service-role client.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  if (req.method === "GET") {
    await handleList(req, res);
    return;
  }
  if (req.method === "POST") {
    await handleCreate(req, res);
    return;
  }
  if (req.method === "PATCH") {
    await handleRespond(req, res);
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const client = getAnonClient(auth.jwt);
  res.setHeader("Cache-Control", "no-store");

  const direction = req.query.direction === "sent" ? "sent" : "received";
  let query = client.from("listing_recommendations").select("*, properties(*)").order("created_at", { ascending: false });
  query = direction === "sent" ? query.eq("advisor_id", auth.userId) : query.eq("user_id", auth.userId);

  const { data, error } = await query;
  if (error) {
    sendError(res, 500, "Failed to load recommendations", error);
    return;
  }
  const rows = data ?? [];
  res.status(200).json({
    recommendations: rows.map(rowToListingRecommendation),
    properties: rows.filter((r) => r.properties).map((r) => rowToProperty(r.properties)),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const auth = await requireRole(req, res, ["advisor", "agent"]);
  if (!auth) return;

  const client = getAnonClient(auth.jwt);
  res.setHeader("Cache-Control", "no-store");

  const body = req.body as CreateRecommendationsBody;
  const propertyIds = Array.isArray(body?.propertyIds) ? body.propertyIds.filter(isUuid) : [];
  const userIds = Array.isArray(body?.userIds) ? body.userIds.filter(isUuid) : [];
  if (propertyIds.length === 0 || userIds.length === 0) {
    sendError(res, 400, "propertyIds and userIds are required");
    return;
  }
  const message = typeof body.message === "string" && body.message.trim() ? body.message.trim() : null;

  // Only send to clients the caller is actually connected to — a multi-row
  // insert fails entirely if RLS's with-check rejects any single row, so
  // this filters down front rather than relying on a partial-failure insert.
  const { data: connections, error: connectionsError } = await client
    .from("advisor_connections")
    .select("user_id")
    .eq("advisor_id", auth.userId)
    .in("user_id", userIds);
  if (connectionsError) {
    sendError(res, 500, "Failed to verify client connections", connectionsError);
    return;
  }
  const connectedUserIds = (connections ?? []).map((c) => c.user_id as string);
  if (connectedUserIds.length === 0) {
    sendError(res, 403, "Not connected to any of the selected clients");
    return;
  }

  const batchId = crypto.randomUUID();
  const rowsToInsert = propertyIds.flatMap((propertyId: string) =>
    connectedUserIds.map((userId) => ({
      batch_id: batchId,
      property_id: propertyId,
      advisor_id: auth.userId,
      user_id: userId,
      message,
    })),
  );

  const { data, error } = await client.from("listing_recommendations").insert(rowsToInsert).select("*");
  if (error) {
    sendError(res, 500, "Failed to send recommendations", error);
    return;
  }
  res.status(201).json({ recommendations: (data ?? []).map(rowToListingRecommendation) });
}

async function handleRespond(req: VercelRequest, res: VercelResponse) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const id = req.query.id;
  if (!isUuid(id)) {
    sendError(res, 400, "Invalid recommendation id");
    return;
  }

  const body = req.body as RespondRecommendationBody;
  if (body?.status !== "accepted" && body?.status !== "dismissed") {
    sendError(res, 400, "status must be 'accepted' or 'dismissed'");
    return;
  }
  const responseMessage =
    typeof body.responseMessage === "string" && body.responseMessage.trim() ? body.responseMessage.trim() : null;

  const client = getAnonClient(auth.jwt);
  res.setHeader("Cache-Control", "no-store");

  const { data, error } = await client
    .from("listing_recommendations")
    .update({ status: body.status, response_message: responseMessage, responded_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", auth.userId)
    .eq("status", "pending")
    .select("*")
    .single();
  if (error || !data) {
    sendError(res, 404, "Recommendation not found or already responded to", error ?? undefined);
    return;
  }
  res.status(200).json(rowToListingRecommendation(data));
}

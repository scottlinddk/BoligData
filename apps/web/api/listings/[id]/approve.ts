import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { ApproveListingBody } from "../../../../../packages/shared/src/types/api.js";
import { applyCors } from "../../../server/middleware/cors.js";
import { requireRole } from "../../../server/middleware/auth.js";
import { getAnonClient } from "../../../server/lib/supabase.js";
import { isUuid, sendError } from "../../../server/lib/http-helpers.js";
import { rowToListingApproval } from "../../../server/lib/row-mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const auth = await requireRole(req, res, ["advisor"]);
  if (!auth) return;

  const propertyId = req.query.id;
  if (!isUuid(propertyId)) {
    sendError(res, 400, "Invalid property id");
    return;
  }

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

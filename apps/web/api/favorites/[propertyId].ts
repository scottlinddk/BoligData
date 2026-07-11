import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../../server/middleware/cors.js";
import { requireUser } from "../../server/middleware/auth.js";
import { getAnonClient } from "../../server/lib/supabase.js";
import { isUuid, sendError } from "../../server/lib/http-helpers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "DELETE") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await requireUser(req, res);
  if (!auth) return;

  const propertyId = req.query.propertyId;
  if (!isUuid(propertyId)) {
    sendError(res, 400, "Invalid property id");
    return;
  }

  const client = getAnonClient(auth.jwt);
  res.setHeader("Cache-Control", "no-store");
  const { error } = await client
    .from("favorites")
    .delete()
    .eq("user_id", auth.userId)
    .eq("property_id", propertyId);
  if (error) {
    sendError(res, 500, "Failed to remove favorite", error);
    return;
  }
  res.status(204).end();
}

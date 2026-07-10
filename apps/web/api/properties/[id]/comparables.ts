import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../../../server/middleware/cors.js";
import { requireUser } from "../../../server/middleware/auth.js";
import { getAnonClient } from "../../../server/lib/supabase.js";
import { isUuid, sendError } from "../../../server/lib/http-helpers.js";
import { getComparables } from "../../../server/lib/comparables.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const id = req.query.id;
  if (!isUuid(id)) {
    sendError(res, 400, "Invalid property id");
    return;
  }

  // Same gating as the property detail endpoint — comparables expose sold
  // prices for nearby properties, which is exactly the data sign-in unlocks.
  const user = await requireUser(req, res);
  if (!user) return;

  try {
    const client = getAnonClient(user.jwt);
    const result = await getComparables(client, id);
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json(result);
  } catch (err) {
    sendError(res, 500, "Failed to load comparables", err);
  }
}

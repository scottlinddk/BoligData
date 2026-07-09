import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../../../server/middleware/cors.js";
import { getAnonClient } from "../../../server/lib/supabase.js";
import { isUuid, sendError, setPublicCache } from "../../../server/lib/http-helpers.js";
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

  try {
    const client = getAnonClient();
    const result = await getComparables(client, id);
    setPublicCache(res, 600, 3600);
    res.status(200).json(result);
  } catch (err) {
    sendError(res, 500, "Failed to load comparables", err);
  }
}

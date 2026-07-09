import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../../middleware/cors";
import { getAnonClient } from "../../lib/supabase";
import { getComparables } from "../../lib/comparables";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const id = req.query.id as string;

  try {
    const client = getAnonClient();
    const result = await getComparables(client, id);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { UpdateAlertBody } from "../../../../../packages/shared/src/types/api.js";
import { applyCors } from "../../../server/middleware/cors.js";
import { requireUser } from "../../../server/middleware/auth.js";
import { getAnonClient } from "../../../server/lib/supabase.js";
import { rowToSearch } from "../../../server/lib/row-mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await requireUser(req, res);
  if (!auth) return;

  const id = req.query.id as string;
  const body = req.body as UpdateAlertBody;
  if (!body?.alertFrequency) {
    res.status(400).json({ error: "alertFrequency is required" });
    return;
  }

  const client = getAnonClient(auth.jwt);
  const { data, error } = await client
    .from("searches")
    .update({ alert_frequency: body.alertFrequency })
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select("*")
    .single();

  if (error || !data) {
    res.status(404).json({ error: error?.message ?? "Search not found" });
    return;
  }

  res.status(200).json(rowToSearch(data));
}

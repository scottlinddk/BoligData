import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { UpdateAlertBody } from "../../../../../packages/shared/src/types/api";
import { applyCors } from "../../../server/middleware/cors";
import { requireUser } from "../../../server/middleware/auth";
import { getAnonClient } from "../../../server/lib/supabase";
import { sendError } from "../../../server/lib/http-helpers";
import { rowToSearch } from "../../../server/lib/row-mappers";

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
  res.setHeader("Cache-Control", "no-store");
  const { data, error } = await client
    .from("searches")
    .update({ alert_frequency: body.alertFrequency })
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select("*")
    .single();

  if (error || !data) {
    sendError(res, 404, "Search not found", error ?? undefined);
    return;
  }

  res.status(200).json(rowToSearch(data));
}

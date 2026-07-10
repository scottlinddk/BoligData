import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { CreateSearchBody } from "../../../packages/shared/src/types/api.js";
import { applyCors } from "../server/middleware/cors.js";
import { requireUser } from "../server/middleware/auth.js";
import { getAnonClient } from "../server/lib/supabase.js";
import { sendError } from "../server/lib/http-helpers.js";
import { rowToSearch } from "../server/lib/row-mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const auth = await requireUser(req, res);
  if (!auth) return;
  const client = getAnonClient(auth.jwt);
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const { data, error } = await client
      .from("searches")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      sendError(res, 500, "Failed to load saved searches", error);
      return;
    }
    res.status(200).json((data ?? []).map(rowToSearch));
    return;
  }

  if (req.method === "POST") {
    const body = req.body as CreateSearchBody;
    if (!body?.name || !body.filters) {
      res.status(400).json({ error: "name and filters are required" });
      return;
    }
    const { data, error } = await client
      .from("searches")
      .insert({
        user_id: auth.userId,
        name: body.name,
        filters: body.filters,
        alert_frequency: body.alertFrequency ?? "none",
      })
      .select("*")
      .single();
    if (error) {
      sendError(res, 500, "Failed to save search", error);
      return;
    }
    res.status(201).json(rowToSearch(data));
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

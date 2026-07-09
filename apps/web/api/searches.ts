import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { CreateSearchBody } from "../../../packages/shared/src/types/api";
import { applyCors } from "../server/middleware/cors";
import { requireUser } from "../server/middleware/auth";
import { getAnonClient } from "../server/lib/supabase";
import { rowToSearch } from "../server/lib/row-mappers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const auth = await requireUser(req, res);
  if (!auth) return;
  const client = getAnonClient(auth.jwt);

  if (req.method === "GET") {
    const { data, error } = await client
      .from("searches")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(201).json(rowToSearch(data));
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

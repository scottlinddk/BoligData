import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { CreateAdvisorConnectionBody } from "../../../../packages/shared/src/types/api.js";
import { applyCors } from "../../server/middleware/cors.js";
import { requireRole } from "../../server/middleware/auth.js";
import { getServiceRoleClient } from "../../server/lib/supabase.js";
import { sendError } from "../../server/lib/http-helpers.js";
import { rowToAdvisorConnection } from "../../server/lib/row-mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const auth = await requireRole(req, res, ["admin"]);
  if (!auth) return;
  const client = getServiceRoleClient();
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const { data, error } = await client
      .from("advisor_connections")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      sendError(res, 500, "Failed to load advisor connections", error);
      return;
    }
    res.status(200).json({ connections: (data ?? []).map(rowToAdvisorConnection) });
    return;
  }

  if (req.method === "POST") {
    const body = req.body as CreateAdvisorConnectionBody;
    if (!body?.advisorId || !body?.userId) {
      res.status(400).json({ error: "advisorId and userId are required" });
      return;
    }

    const [{ data: advisorProfile }, { data: userProfile }] = await Promise.all([
      client.from("user_profiles").select("role").eq("id", body.advisorId).single(),
      client.from("user_profiles").select("role").eq("id", body.userId).single(),
    ]);
    if (advisorProfile?.role !== "advisor") {
      res.status(400).json({ error: "advisorId does not belong to an advisor account" });
      return;
    }
    if (!userProfile) {
      res.status(400).json({ error: "userId does not exist" });
      return;
    }

    const { data, error } = await client
      .from("advisor_connections")
      .insert({ advisor_id: body.advisorId, user_id: body.userId, created_by: auth.userId })
      .select("*")
      .single();
    if (error || !data) {
      sendError(res, 409, "This connection already exists", error ?? undefined);
      return;
    }
    res.status(201).json(rowToAdvisorConnection(data));
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { CreateFavoriteBody } from "../../../packages/shared/src/types/api.js";
import { applyCors } from "../server/middleware/cors.js";
import { requireUser } from "../server/middleware/auth.js";
import { getAnonClient } from "../server/lib/supabase.js";
import { isUuid, sendError } from "../server/lib/http-helpers.js";
import { rowToFavorite, rowToProperty } from "../server/lib/row-mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const auth = await requireUser(req, res);
  if (!auth) return;
  const client = getAnonClient(auth.jwt);
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const { data, error } = await client
      .from("favorites")
      .select("*, properties(*)")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false });
    if (error) {
      sendError(res, 500, "Failed to load favorites", error);
      return;
    }
    const rows = data ?? [];
    res.status(200).json({
      favorites: rows.map(rowToFavorite),
      properties: rows.filter((r) => r.properties).map((r) => rowToProperty(r.properties)),
    });
    return;
  }

  if (req.method === "POST") {
    const body = req.body as CreateFavoriteBody;
    if (!isUuid(body?.propertyId)) {
      res.status(400).json({ error: "propertyId is required" });
      return;
    }
    const { data, error } = await client
      .from("favorites")
      .insert({ user_id: auth.userId, property_id: body.propertyId })
      .select("*")
      .single();
    if (error || !data) {
      sendError(res, 409, "Failed to save favorite", error ?? undefined);
      return;
    }
    res.status(201).json(rowToFavorite(data));
    return;
  }

  // DELETE /api/favorites?propertyId=<uuid> — remove a favorite. (Was
  // DELETE /api/favorites/:propertyId; folded in here to stay under
  // Vercel's serverless function count limit.)
  if (req.method === "DELETE") {
    const propertyId = req.query.propertyId;
    if (!isUuid(propertyId)) {
      sendError(res, 400, "Invalid property id");
      return;
    }
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
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

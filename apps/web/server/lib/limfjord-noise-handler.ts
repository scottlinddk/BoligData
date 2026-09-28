import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { lookupLimfjordNoise } from "./enrichment-sources/limfjord-noise.js";
import { sendError } from "./http-helpers.js";
import { rowToProperty } from "./row-mappers.js";

export async function handleLimfjordNoise(client: SupabaseClient, id: string, req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  const language = req.query.lang ?? "da";
  if (language !== "da" && language !== "en") {
    sendError(res, 400, "Invalid language; use da or en");
    return;
  }
  const { data, error } = await client.from("properties")
    .select("id, address, postal_code, id_lokalid, lat, lon").eq("id", id).single();
  if (error || !data) {
    sendError(res, 404, "Property not found");
    return;
  }
  res.status(200).json(await lookupLimfjordNoise(rowToProperty(data), language));
}

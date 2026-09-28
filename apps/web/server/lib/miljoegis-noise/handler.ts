import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendError } from "../http-helpers.js";
import { NOISE_LAYERS } from "./layers.js";
import { lookupMiljoegisNoise } from "./source.js";

export async function handleMiljoegisNoise(client: SupabaseClient, id: string, req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  const source = req.query.source ?? "urban_roads", metric = req.query.metric ?? "Lden";
  const layer = NOISE_LAYERS.find(value => value.source === source && value.metric === metric);
  if (!layer) { sendError(res, 400, "Invalid noise source or metric"); return; }
  const { data, error } = await client.from("properties").select("lat,lon,data_mode").eq("id", id).single();
  if (error || !data) { sendError(res, 404, "Property not found"); return; }
  res.status(200).json(await lookupMiljoegisNoise({
    lat: data.lat === null ? null : Number(data.lat), lon: data.lon === null ? null : Number(data.lon), dataMode: data.data_mode,
  }, layer));
}

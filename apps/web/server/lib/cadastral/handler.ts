import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelResponse } from "@vercel/node";
import { rowToProperty } from "../row-mappers.js";
import { getCadastralReport } from "./source.js";

export async function handleCadastral(client: SupabaseClient, id: string, res: VercelResponse): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  const property = await client.from("properties").select("*").eq("id", id).single();
  if (property.error || !property.data) { res.status(404).json({ error: "Property not found" }); return; }
  const budget = await client.rpc("consume_register_lookup_budget");
  if (budget.error) { res.status(503).json({ error: "Register lookup temporarily unavailable" }); return; }
  if (budget.data !== true) { res.setHeader("Retry-After", "3600"); res.status(429).json({ error: "Register lookup limit reached" }); return; }
  res.status(200).json(await getCadastralReport(rowToProperty(property.data)));
}

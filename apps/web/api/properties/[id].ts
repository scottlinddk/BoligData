import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../../server/middleware/cors.js";
import { getAnonClient } from "../../server/lib/supabase.js";
import { rowToEnrichment, rowToProperty } from "../../server/lib/row-mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const id = req.query.id as string;

  try {
    const client = getAnonClient();
    const { data: propertyRow, error: propertyError } = await client
      .from("properties")
      .select("*")
      .eq("id", id)
      .single();

    if (propertyError || !propertyRow) {
      res.status(404).json({ error: "Property not found" });
      return;
    }

    const { data: enrichmentRow } = await client
      .from("enrichments")
      .select("*")
      .eq("property_id", id)
      .maybeSingle();

    res.status(200).json({
      property: rowToProperty(propertyRow),
      enrichment: enrichmentRow ? rowToEnrichment(enrichmentRow) : null,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
}

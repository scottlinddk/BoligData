import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../../server/middleware/cors";
import { requireUser } from "../../server/middleware/auth";
import { getAnonClient } from "../../server/lib/supabase";
import { isUuid, sendError } from "../../server/lib/http-helpers";
import { rowToEnrichment, rowToProperty } from "../../server/lib/row-mappers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const id = req.query.id;
  if (!isUuid(id)) {
    sendError(res, 400, "Invalid property id");
    return;
  }

  // Full listing detail (price, sold-price history, risk flags, etc.) is
  // gated behind sign-in, same as the search endpoint's full property shape.
  const user = await requireUser(req, res);
  if (!user) return;

  try {
    const client = getAnonClient(user.jwt);
    const [propertyResult, enrichmentResult] = await Promise.all([
      client.from("properties").select("*").eq("id", id).single(),
      client.from("enrichments").select("*").eq("property_id", id).maybeSingle(),
    ]);

    if (propertyResult.error || !propertyResult.data) {
      sendError(res, 404, "Property not found");
      return;
    }

    // Per-user auth response — never let a CDN share it across callers.
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json({
      property: rowToProperty(propertyResult.data),
      enrichment: enrichmentResult.data ? rowToEnrichment(enrichmentResult.data) : null,
    });
  } catch (err) {
    sendError(res, 500, "Failed to load property", err);
  }
}

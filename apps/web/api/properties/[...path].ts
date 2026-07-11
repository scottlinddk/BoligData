import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../../server/middleware/cors.js";
import { requireUser } from "../../server/middleware/auth.js";
import { getAnonClient } from "../../server/lib/supabase.js";
import { isUuid, sendError } from "../../server/lib/http-helpers.js";
import { rowToEnrichment, rowToProperty } from "../../server/lib/row-mappers.js";
import { getComparables } from "../../server/lib/comparables.js";

function pathSegments(req: VercelRequest): string[] {
  const raw = req.query.path;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

/**
 * Consolidated router for /api/properties/:id and /api/properties/:id/comparables.
 * One catch-all file instead of one file per route keeps the Vercel serverless
 * function count under the plan limit.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const [id, sub, ...rest] = pathSegments(req);
  if (!isUuid(id) || rest.length > 0 || (sub !== undefined && sub !== "comparables")) {
    sendError(res, 400, "Invalid property id");
    return;
  }

  // Full listing detail and comparables (sold prices) are gated behind
  // sign-in, same as the search endpoint's full property shape.
  const user = await requireUser(req, res);
  if (!user) return;

  const client = getAnonClient(user.jwt);

  try {
    if (sub === "comparables") {
      const result = await getComparables(client, id);
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(result);
      return;
    }

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
    sendError(res, 500, sub === "comparables" ? "Failed to load comparables" : "Failed to load property", err);
  }
}

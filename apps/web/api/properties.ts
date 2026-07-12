import type { VercelRequest, VercelResponse } from "@vercel/node";
import type {
  SearchPropertiesQuery,
  SortDirection,
  SortField,
} from "../../../packages/shared/src/types/api.js";
import { applyCors } from "../server/middleware/cors.js";
import { getOptionalUser, requireUser } from "../server/middleware/auth.js";
import { getAnonClient } from "../server/lib/supabase.js";
import { isUuid, sendError, setPublicCache } from "../server/lib/http-helpers.js";
import { rowToEnrichment, rowToProperty } from "../server/lib/row-mappers.js";
import { searchProperties } from "../server/lib/search.js";
import { getComparables } from "../server/lib/comparables.js";

function str(v: unknown): string | undefined {
  return Array.isArray(v) ? v[0] : (v as string | undefined);
}

function num(v: unknown): number | undefined {
  const s = str(v);
  if (s === undefined || s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseQuery(req: VercelRequest): SearchPropertiesQuery {
  const q = req.query;
  return {
    location: str(q.location),
    postnummer: str(q.postnummer),
    minPrice: num(q.minPrice),
    maxPrice: num(q.maxPrice),
    minSqm: num(q.minSqm),
    maxSqm: num(q.maxSqm),
    maxDaysOnMarket: num(q.maxDaysOnMarket),
    minBuildingYear: num(q.minBuildingYear),
    maxBuildingYear: num(q.maxBuildingYear),
    sortField: str(q.sortField) as SortField | undefined,
    sortDirection: str(q.sortDirection) as SortDirection | undefined,
    limit: num(q.limit),
    offset: num(q.offset),
  };
}

/**
 * GET /api/properties?id=<uuid> — single listing detail, or
 * GET /api/properties?id=<uuid>&comparables=true — its comparables.
 * Folded into the search handler (query params, not a [...path] dynamic
 * route) because Vercel's file-based catch-all routing doesn't reliably
 * populate req.query for a folder route that sits alongside a same-named
 * flat file (api/properties.ts + api/properties/[...path].ts) — the
 * catch-all was landing with an empty path array in production.
 */
async function handlePropertyById(req: VercelRequest, res: VercelResponse, id: string): Promise<void> {
  if (!isUuid(id)) {
    sendError(res, 400, "Invalid property id");
    return;
  }

  // Full listing detail and comparables (sold prices) are gated behind
  // sign-in, same as the search endpoint's full property shape.
  const user = await requireUser(req, res);
  if (!user) return;

  const client = getAnonClient(user.jwt);
  const wantsComparables = str(req.query.comparables) === "true";

  try {
    if (wantsComparables) {
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
    sendError(res, 500, wantsComparables ? "Failed to load comparables" : "Failed to load property", err);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const id = str(req.query.id);
  if (id !== undefined) {
    await handlePropertyById(req, res, id);
    return;
  }

  try {
    const user = await getOptionalUser(req);
    const client = getAnonClient(user?.jwt);
    const result = await searchProperties(client, parseQuery(req), user !== null);
    // Signed-in responses carry per-user data and must never be shared by a
    // CDN across callers; only the anonymous (address-only) shape is safe
    // to cache publicly by URL.
    if (user) {
      res.setHeader("Cache-Control", "private, no-store");
    } else {
      setPublicCache(res, 300, 3600);
    }
    res.status(200).json(result);
  } catch (err) {
    sendError(res, 500, "Failed to search properties", err);
  }
}

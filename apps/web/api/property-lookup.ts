import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { PropertyLookupInput, RoomCountDefinition } from "../../../packages/shared/src/types/property-lookup.js";
import { applyCors } from "../server/middleware/cors.js";
import { sendError } from "../server/lib/http-helpers.js";
import { lookupProperty } from "../server/lib/property-lookup/property-lookup.handler.js";
import { requireUser } from "../server/middleware/auth.js";
import { getAnonClient } from "../server/lib/supabase.js";

function str(v: unknown): string | undefined {
  return Array.isArray(v) ? v[0] : (v as string | undefined);
}

function num(v: unknown): number | undefined {
  const s = str(v);
  if (s === undefined || s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const ROOM_COUNT_DEFINITIONS: readonly RoomCountDefinition[] = ["A", "B", "C"];

function parseInput(req: VercelRequest): PropertyLookupInput | null {
  const address = str(req.query.address)?.trim();
  const askingPrice = num(req.query.askingPrice);
  if (!address || address.length > 300 || askingPrice === undefined || askingPrice <= 0 || askingPrice > 1_000_000_000) return null;
  const lat = num(req.query.lat);
  const lon = num(req.query.lon);
  if ((lat === undefined) !== (lon === undefined)) return null;
  if (lat !== undefined && lon !== undefined && (lat < 54 || lat > 58 || lon < 7 || lon > 16)) return null;

  const roomCountDefinitionRaw = str(req.query.roomCountDefinition);
  const roomCountDefinition = ROOM_COUNT_DEFINITIONS.includes(roomCountDefinitionRaw as RoomCountDefinition)
    ? (roomCountDefinitionRaw as RoomCountDefinition)
    : undefined;

  return {
    address,
    askingPrice,
    postalCode: str(req.query.postalCode) ?? null,
    lat: lat ?? null,
    lon: lon ?? null,
    sellerTakeoverDate: str(req.query.sellerTakeoverDate) ?? null,
    totalEncumbrancesDkk: num(req.query.totalEncumbrancesDkk) ?? null,
    roomCountDefinition,
    roomCount: num(req.query.roomCount) ?? null,
    energyLabel: str(req.query.energyLabel) ?? null,
  };
}

/**
 * GET /api/property-lookup?address=...&askingPrice=... — resolves a
 * free-text Danish address against the address register, BBR and VUR,
 * screens it against the hard house-buying criteria, and returns the raw
 * inputs for the relative scoring model. Every value in the response is
 * tagged `source: "ai"`; this endpoint never asserts `source: "verified"` —
 * that's a human call. `sources` reports, per register, whether each group of
 * values came back live, mock or unavailable, and why.
 *
 * Requires a signed-in account and an atomic database-backed lookup budget
 * (30 requests/hour/account), shared by all serverless instances. Upstream
 * credentials must never be exposed through an unmetered public proxy.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  res.setHeader("Cache-Control", "private, no-store");
  const auth = await requireUser(req, res);
  if (!auth) return;

  const input = parseInput(req);
  if (!input) {
    sendError(res, 400, "address and askingPrice query parameters are required");
    return;
  }

  try {
    const { data: allowed, error } = await getAnonClient(auth.jwt).rpc("consume_register_lookup_budget");
    if (error) {
      sendError(res, 503, "Register lookup limits are temporarily unavailable", error);
      return;
    }
    if (allowed !== true) {
      res.setHeader("Retry-After", "3600");
      sendError(res, 429, "Register lookup limit reached. Please try again later.");
      return;
    }
    const result = await lookupProperty(input);
    res.status(200).json(result);
  } catch (err) {
    sendError(res, 500, "Failed to look up property", err);
  }
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { PropertyLookupInput, RoomCountDefinition } from "../../../packages/shared/src/types/property-lookup.js";
import { applyCors } from "../server/middleware/cors.js";
import { sendError, setPublicCache } from "../server/lib/http-helpers.js";
import { lookupProperty } from "../server/lib/property-lookup/property-lookup.handler.js";

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
  const address = str(req.query.address);
  const askingPrice = num(req.query.askingPrice);
  if (!address || askingPrice === undefined) return null;

  const roomCountDefinitionRaw = str(req.query.roomCountDefinition);
  const roomCountDefinition = ROOM_COUNT_DEFINITIONS.includes(roomCountDefinitionRaw as RoomCountDefinition)
    ? (roomCountDefinitionRaw as RoomCountDefinition)
    : undefined;

  return {
    address,
    askingPrice,
    postalCode: str(req.query.postalCode) ?? null,
    lat: num(req.query.lat) ?? null,
    lon: num(req.query.lon) ?? null,
    sellerTakeoverDate: str(req.query.sellerTakeoverDate) ?? null,
    totalEncumbrancesDkk: num(req.query.totalEncumbrancesDkk) ?? null,
    roomCountDefinition,
    roomCount: num(req.query.roomCount) ?? null,
    energyLabel: str(req.query.energyLabel) ?? null,
  };
}

/**
 * GET /api/property-lookup?address=...&askingPrice=... — resolves a
 * free-text Danish address against DAR/BBR/OIS, screens it against the
 * hard house-buying criteria, and returns the raw inputs for the relative
 * scoring model. Every value in the response is tagged `source: "ai"`;
 * this endpoint never asserts `source: "verified"` — that's a human call.
 *
 * Open — no Authorization header required, so scripts and the scheduled
 * screening task can call it without minting a browser session. It reads
 * nothing per-caller: the response is a pure function of the query params
 * plus the deployment-wide `SCREENING_*` thresholds
 * (`DEFAULT_FINANCING_ASSUMPTIONS`), touches no Supabase row, and is
 * identical for every caller — which is also why it is safe to hand to the
 * CDN. Two consequences worth knowing: the configured thresholds are
 * inferable from the screening reasons, and once the enrichment sources
 * leave mock mode this is an unmetered public path to the
 * `DATAFORDELER_API_KEY` upstream, throttled only by the cache below.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const input = parseInput(req);
  if (!input) {
    sendError(res, 400, "address and askingPrice query parameters are required");
    return;
  }

  try {
    const result = await lookupProperty(input);
    // Same public-GET caching as the anonymous /api/properties response. The
    // CDN keys on the full query string, and BBR/DAR/VUR facts move far more
    // slowly than this window, so it mostly serves to keep a hot address from
    // re-hitting Datafordeler on every request.
    setPublicCache(res, 300, 3600);
    res.status(200).json(result);
  } catch (err) {
    sendError(res, 500, "Failed to look up property", err);
  }
}

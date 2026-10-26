import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelResponse } from "@vercel/node";
import type { ParcelOwnerResponse } from "../../../../../packages/shared/src/types/parcel-map.js";
import { getParcelAddresses, getParcelOwners } from "../cadastral/source.js";
import { parseParcelBbox } from "./bbox.js";
import { getParcelsInView, parcelMapMockMode } from "./source.js";

/** Geometry only: no personal data, so no register quota. The bbox size cap bounds the cost. */
export async function handleParcels(bboxParam: unknown, res: VercelResponse): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  const bbox = parseParcelBbox(bboxParam);
  if (!bbox) { res.status(400).json({ error: "Invalid bbox: use minLon,minLat,maxLon,maxLat inside Denmark and zoomed in to street level" }); return; }
  res.status(200).json(await getParcelsInView(bbox));
}

/** One owner lookup per click, on the same hourly register quota as the listing page's owner panel. */
export async function handleParcelOwner(client: SupabaseClient, bfeParam: unknown, res: VercelResponse): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  const bfe = typeof bfeParam === "string" && /^[1-9]\d{0,14}$/.test(bfeParam) ? bfeParam : null;
  if (!bfe) { res.status(400).json({ error: "Invalid BFE number" }); return; }
  // Mock parcels carry no BFE, so this is only reachable by a hand-built request; never query real registers in mock mode.
  if (parcelMapMockMode()) { res.status(200).json({ bfeNumber: bfe, status: "unavailable", owners: [], addresses: [], reason: "source_unavailable" } satisfies ParcelOwnerResponse); return; }
  const budget = await client.rpc("consume_register_lookup_budget");
  if (budget.error) { res.status(503).json({ error: "Register lookup temporarily unavailable" }); return; }
  if (budget.data !== true) { res.setHeader("Retry-After", "3600"); res.status(429).json({ error: "Register lookup limit reached" }); return; }
  const [owners, addresses] = await Promise.all([getParcelOwners(bfe), getParcelAddresses(bfe)]);
  // Definitive answers are cached by the browser for a day so repeat views never spend the hourly budget again.
  // A failed or inconclusive lookup stays `no-store` so it is retried.
  if ((owners.status === "available" || owners.status === "not_found") && owners.reason !== "source_unavailable") res.setHeader("Cache-Control", "private, max-age=86400");
  res.status(200).json({ bfeNumber: bfe, status: owners.status, owners: owners.items, addresses, reason: owners.reason } satisfies ParcelOwnerResponse);
}

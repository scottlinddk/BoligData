import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelResponse } from "@vercel/node";
import { sendError } from "./http-helpers.js";
import { buildSparSegment, estimateForListing, type SparSaleRow, type SparSegment, type SparValuationRow } from "./spar-estimate.js";

const UNIT_TYPES = new Set(["apartment", "villa_apartment"]);
const SEGMENT_TTL_MS = 30 * 60 * 1000;
const PAGE = 1000;
const segmentCache = new Map<boolean, { at: number; segment: SparSegment }>();

async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error instanceof Error ? error : new Error("spar query failed");
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function loadSegment(client: SupabaseClient, isUnit: boolean, asOf: string): Promise<SparSegment> {
  const hit = segmentCache.get(isUnit);
  if (hit && Date.now() - hit.at < SEGMENT_TTL_MS && hit.segment.asOf === asOf) return hit.segment;
  const [valRows, saleRows] = await Promise.all([
    readAll<Record<string, unknown>>((a, b) => client.from("property_valuations")
      .select("property_id,bfe_nummer,bfe_type,valuation_year,assessed_property_value_dkk,registered_at,observed_at")
      .eq("data_mode", "real").eq("bfe_type", isUnit ? "EL" : "SFE").order("id").range(a, b)),
    readAll<Record<string, unknown>>((a, b) => client.from("sale_transactions")
      .select("id,property_id,sold_date,sale_price,sale_type").eq("data_mode", "real").not("sale_price", "is", null).order("id").range(a, b)),
  ]);
  const valuations: SparValuationRow[] = valRows.flatMap((r) => {
    const value = Number(r.assessed_property_value_dkk);
    if (!Number.isFinite(value) || value <= 0) return [];
    // registered_at comes from VUR's registration date when the backfill could read it. Otherwise observed_at
    // (when we first held the value) is a safe "known by" date for a live estimate but not for a backtest.
    const knownAt = (r.registered_at ?? r.observed_at) as string | null;
    return [{ propertyId: String(r.property_id), bfe: String(r.bfe_nummer), bfeType: r.bfe_type as SparValuationRow["bfeType"],
      valuationYear: Number(r.valuation_year), value, registeredAt: knownAt }];
  });
  const sales: SparSaleRow[] = saleRows.flatMap((r) => r.sold_date && Number(r.sale_price) > 0
    ? [{ id: String(r.id), propertyId: String(r.property_id), soldDate: String(r.sold_date), price: Number(r.sale_price), saleType: (r.sale_type as string | null) ?? null }] : []);
  const segment = buildSparSegment({ asOf, isUnit, valuations, sales });
  segmentCache.set(isUnit, { at: Date.now(), segment });
  return segment;
}

/** Authenticated stored-listing lookup. Estimates only, computed from our own sales and stored valuations. */
export async function handleSpar(client: SupabaseClient, res: VercelResponse, id: string): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  const { data: property, error } = await client.from("properties").select("id,price,property_type").eq("id", id).single();
  if (error || !property) {
    sendError(res, 404, "Property not found");
    return;
  }
  const isUnit = UNIT_TYPES.has(String(property.property_type));
  const asOf = new Date().toISOString().slice(0, 10);
  const segment = await loadSegment(client, isUnit, asOf);
  const price = Number(property.price);
  res.status(200).json(estimateForListing(segment, { propertyId: property.id, askingPrice: Number.isFinite(price) && price > 0 ? price : null }));
}

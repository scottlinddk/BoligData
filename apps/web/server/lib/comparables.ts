import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ComparableEntry,
  ComparablesResponse,
} from "../../../../packages/shared/src/types/api";
import { haversineMeters, rowToProperty } from "./row-mappers";

const CANDIDATE_LIMIT = 20;
const RESULT_LIMIT = 5;
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Comparable sold properties: same municipality + property type, sold within
 * the last 12 months, ranked by straight-line distance. Uses in-memory
 * haversine over a small filtered candidate set rather than a PostGIS RPC —
 * fine at MVP data volumes; revisit with ST_DWithin over the indexed
 * `location` column if the properties table grows into the tens of thousands.
 */
export async function getComparables(
  client: SupabaseClient,
  propertyId: string,
): Promise<ComparablesResponse> {
  const { data: target, error: targetError } = await client
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .single();

  if (targetError || !target) throw targetError ?? new Error("Property not found");

  const cutoff = new Date(Date.now() - TWELVE_MONTHS_MS).toISOString().slice(0, 10);

  const { data: candidates, error: candidatesError } = await client
    .from("properties")
    .select("*")
    .eq("status", "sold")
    .eq("municipality", target.municipality)
    .eq("property_type", target.property_type)
    .neq("id", propertyId)
    .gte("listing_date", cutoff)
    .order("listing_date", { ascending: false })
    .limit(CANDIDATE_LIMIT);

  if (candidatesError) throw candidatesError;

  const candidateIds = (candidates ?? []).map((c) => c.id);
  const enrichmentByPropertyId = new Map<string, any>();
  if (candidateIds.length > 0) {
    const { data: enrichments } = await client
      .from("enrichments")
      .select("property_id, sold_price_history")
      .in("property_id", candidateIds);
    for (const row of enrichments ?? []) {
      enrichmentByPropertyId.set(row.property_id, row.sold_price_history?.[0] ?? null);
    }
  }

  const comparables: ComparableEntry[] = (candidates ?? [])
    .map((row) => {
      const property = rowToProperty(row);
      const soldEntry = enrichmentByPropertyId.get(row.id);
      return {
        property,
        soldDate: soldEntry?.soldDate ?? property.listingDate,
        price: soldEntry?.price ?? property.price,
        pricePerSqm: soldEntry?.pricePerSqm ?? Math.round(property.price / property.sqm),
        distanceMeters: haversineMeters(target.lat, target.lon, property.lat, property.lon),
      };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, RESULT_LIMIT);

  const neighborhoodAvgPricePerSqm =
    comparables.length > 0
      ? Math.round(comparables.reduce((sum, c) => sum + c.pricePerSqm, 0) / comparables.length)
      : null;

  return { comparables, neighborhoodAvgPricePerSqm };
}

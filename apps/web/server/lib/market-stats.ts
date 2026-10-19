import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketStatPoint, MarketStatsResponse } from "../../../../packages/shared/src/types/api.js";

/** Boligsiden Markedsindeks series for the property's municipality + type (see migration 012). */
export async function getMarketStats(client: SupabaseClient, propertyId: string): Promise<MarketStatsResponse> {
  const { data: property, error: propertyError } = await client
    .from("properties")
    .select("municipality, property_type")
    .eq("id", propertyId)
    .single();
  if (propertyError || !property) throw propertyError ?? new Error("Property not found");

  const { data, error } = await client
    .from("market_stats")
    .select("stat_type, period_start, value, prev_year_value")
    .eq("location_type", "municipality")
    .eq("location_name", property.municipality)
    .eq("property_type", property.property_type)
    .order("period_start", { ascending: true });
  if (error) throw error;

  const series = (statType: string): MarketStatPoint[] =>
    (data ?? [])
      .filter((r) => r.stat_type === statType)
      .map((r) => ({
        periodStart: r.period_start as string,
        value: Number(r.value),
        prevYearValue: r.prev_year_value === null ? null : Number(r.prev_year_value),
      }));

  return {
    municipality: property.municipality as string,
    pricePerSqm: series("sold_per_area_price"),
    daysOnMarket: series("sold_time_on_market"),
    priceChangePerSqm: series("sold_per_area_price_change"),
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { dstCategoryFor, regionForMunicipality } from "./crawl/dst-stats.js";
import type { MarketStatPoint, MarketStatsResponse, RegionalMarketStats } from "../../../../packages/shared/src/types/api.js";

async function getRegionalStats(client: SupabaseClient, municipality: string, propertyType: string): Promise<RegionalMarketStats | null> {
  const category = dstCategoryFor(propertyType);
  if (!category) return null;
  const region = regionForMunicipality(municipality);
  const { data, error } = await client
    .from("regional_market_stats")
    .select("stat_type, period_start, value, prev_year_value")
    .eq("source", "dst")
    .eq("region_code", region.code)
    .eq("category_code", category)
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
  return { regionName: region.name, avgPrice: series("avg_price"), salesCount: series("sales_count"), priceChangeYoy: series("price_change_yoy") };
}

/**
 * Boligsiden Markedsindeks series for the property's municipality + type (migration 030),
 * plus the Danmarks Statistik regional series for the same property type (migration 031).
 */
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
    // Optional context: a failure here (e.g. migration 031 not applied yet) must not hide the Boligsiden series.
    regional: await getRegionalStats(client, property.municipality as string, property.property_type as string).catch(() => null),
  };
}

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMarketStats } from "./market-stats.js";

function fakeClient(regionalError: Error | null = null) {
  const filters: Array<[string, unknown]> = [];
  const query = (table: string) => {
    const chain = {
      select: () => chain,
      eq: (col: string, val: unknown) => { filters.push([`${table}.${col}`, val]); return chain; },
      order: () => (table === "market_stats"
        ? Promise.resolve({ data: [{ stat_type: "sold_per_area_price", period_start: "2026-09-01", value: "15000", prev_year_value: null }], error: null })
        : Promise.resolve(regionalError
            ? { data: null, error: regionalError }
            : { data: [
                { stat_type: "avg_price", period_start: "2026-04-01", value: "1900000", prev_year_value: "1800000" },
                { stat_type: "sales_count", period_start: "2026-04-01", value: "1352", prev_year_value: null },
              ], error: null })),
      single: () => Promise.resolve({ data: { municipality: "Aalborg", property_type: "apartment" }, error: null }),
    };
    return chain;
  };
  return { client: { from: query } as unknown as SupabaseClient, filters };
}

describe("getMarketStats regional series", () => {
  it("adds the DST region and category for the property", async () => {
    const { client, filters } = fakeClient();
    const stats = await getMarketStats(client, "id");
    expect(filters).toContainEqual(["regional_market_stats.region_code", "081"]);
    expect(filters).toContainEqual(["regional_market_stats.category_code", "2103"]);
    expect(stats.regional).toEqual({
      regionName: "Region Nordjylland",
      avgPrice: [{ periodStart: "2026-04-01", value: 1_900_000, prevYearValue: 1_800_000 }],
      salesCount: [{ periodStart: "2026-04-01", value: 1352, prevYearValue: null }],
      priceChangeYoy: [],
    });
  });

  it("keeps the Boligsiden series when the regional lookup fails", async () => {
    const { client } = fakeClient(new Error("relation does not exist"));
    const stats = await getMarketStats(client, "id");
    expect(stats.regional).toBeNull();
    expect(stats.pricePerSqm).toHaveLength(1);
  });
});

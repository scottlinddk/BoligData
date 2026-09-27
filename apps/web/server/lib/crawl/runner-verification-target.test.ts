import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyCrawlData } from "./runner-verification.js";

vi.mock("../research/market-source.js", () => ({ fetchMarketSales: vi.fn(async () => ({ transactions: [], truncated: false, status: "unavailable", failure: "http_403" })) }));

it("verifies stored comparisons without calling unavailable live data an empty market", async () => {
  const property = { id: "9dfbb273-37da-4e21-b8c7-f482d2aae19d", address: "Bejsebakkevej 30", municipality: "Aalborg", property_type: "villa", postal_code: "9000", lat: 57.036, lon: 9.899, data_mode: "real", sqm: 130 };
  const now = new Date().toISOString();
  const requests: { table: string; columns: string; filters: [string, unknown][] }[] = [];
  const client = { from(table: string) { return { select(columns: string, options?: { head?: boolean }) {
    const request = { table, columns, filters: [] as [string, unknown][] }; requests.push(request);
    const reply = () => {
      if (options?.head) return { count: 2, error: null };
      if (table === "properties") return { data: request.filters.some(([key]) => key === "id") ? property : [], error: null };
      if (table === "enrichments") return { data: { source_status: {} }, error: null };
      if (table === "source_observations") return { data: [], error: null };
      return { data: [1, 2].map(i => ({ id: `sale-${i}`, property_id: `other-${i}`, sold_date: now.slice(0, 10), date_precision: "day", sale_price: 2_500_000, sale_type: "normal", residential_area: 130, area_definition: "residential", area_as_of: now.slice(0, 10), observed_at: now, data_mode: "real", source: "boligsiden", properties: { address: `Othervej ${i}`, municipality: "Aalborg", property_type: "villa" } })), error: null };
    };
    const query = {
      eq(key: string, value: unknown) { request.filters.push([key, value]); return query; },
      is(key: string, value: unknown) { request.filters.push([key, value]); return query; },
      neq() { return query; }, order() { return query; }, limit() { return query; }, maybeSingle() { return query; }, gte() { return query; }, lte() { return query; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(reply()).then(resolve); },
    }; return query;
  } }; } } as unknown as SupabaseClient;
  const result = await verifyCrawlData(client);
  expect(result.targetMarket).toMatchObject({ sourceStatus: "unavailable", sourceFailure: "http_403", population: "stored_listing_sales", transactions: 2, eligibleSales: 2, baselinePrice: 2_500_000 });
  const marketRead = requests.find(row => row.columns.includes("properties!inner"));
  expect(marketRead?.filters).toContainEqual(["owner_id", null]);
  expect(marketRead?.filters).toContainEqual(["data_mode", "real"]);
  expect(marketRead?.filters).toContainEqual(["properties.municipality", "Aalborg"]);
});

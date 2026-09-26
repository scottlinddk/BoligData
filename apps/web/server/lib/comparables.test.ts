import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getComparables } from "./comparables.js";

const target = { id: "subject", municipality: "Aalborg", property_type: "villa", data_mode: "real", lat: 57, lon: 10 };
function transaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "sale-1", property_id: "property-1", sale_price: 3_000_000, sold_date: "2026-01-01", date_precision: "day",
    residential_area: 150, area_definition: "residential", area_as_of: "2026-01-01", sale_type: "normal", data_mode: "real",
    source: "boligsiden", registration_id: "registration-1",
    property: { ...target, id: "property-1", address: "Referencevej 1", price: 6_000_000, sqm: 300, listing_date: "2026-02-01", listing_date_definition: "source_reported", listing_source: "boligsiden", external_id: "case-1", lat: 57.001, status: "active" },
    ...overrides,
  };
}
function database(sales: Record<string, unknown>[], targetRow = target) {
  const calls: string[] = [];
  const client = {
    from(name: string) {
      calls.push(name);
      if (name === "properties") return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: targetRow, error: null }) }) }) };
      if (name !== "sale_transactions") throw new Error("Unexpected legacy data source");
      const builder = {
        select: () => builder, eq: () => builder, neq: () => builder, gte: () => builder, lte: () => builder,
        order: () => builder, limit: () => builder,
        then: (resolve: (value: unknown) => void) => resolve({ data: sales, error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-26T10:00:00Z")); });
afterEach(() => vi.useRealTimers());

describe("documented comparable transactions", () => {
  it("uses a documented sale and its at-sale residential area, independent of current asking price and listing status", async () => {
    const db = database([transaction()]);
    const result = await getComparables(db.client, "subject");
    expect(result.comparables).toHaveLength(1);
    expect(result.comparables[0]).toMatchObject({ price: 3_000_000, pricePerSqm: 20_000, soldDate: "2026-01-01" });
    expect(result.neighborhoodAvgPricePerSqm).toBe(20_000);
    expect(db.calls).toEqual(["properties", "sale_transactions"]);
  });

  it.each([
    { sale_price: null }, { sold_date: null }, { residential_area: null }, { residential_area: 0 },
    { area_definition: "weighted" }, { area_as_of: "2026-09-26" }, { area_as_of: null },
    { data_mode: "mock" }, { data_mode: "unknown" }, { sale_type: "family" }, { sale_type: "auction" },
    { sold_date: "2027-01-01" }, { sold_date: "2020-01-01" }, { date_precision: "month" },
  ])("rejects unsupported transaction data without substituting listing facts: %o", async (invalid) => {
    const result = await getComparables(database([transaction(invalid)]).client, "subject");
    expect(result.comparables).toEqual([]);
    expect(result.neighborhoodAvgPricePerSqm).toBeNull();
  });

  it("excludes mismatched types, identity, and legacy/mock property data", async () => {
    const base = transaction();
    const sales = [
      transaction({ property: { ...base.property, property_type: "apartment" } }),
      transaction({ property: { ...base.property, municipality: "Aarhus" } }),
      transaction({ property: { ...base.property, data_mode: "unknown" } }),
      transaction({ property: { ...base.property, id: "wrong-unit" } }),
    ];
    expect((await getComparables(database(sales).client, "subject")).comparables).toEqual([]);
  });

  it("deduplicates repeated registrations and sources for one documented transaction", async () => {
    const sales = [transaction(), transaction({ id: "duplicate", source: "import", registration_id: null })];
    expect((await getComparables(database(sales).client, "subject")).comparables).toHaveLength(1);
  });

  it("does not calculate a production reference for a mock target property", async () => {
    const db = database([transaction()], { ...target, data_mode: "mock" });
    expect((await getComparables(db.client, "subject")).comparables).toEqual([]);
    expect(db.calls).toEqual(["properties"]);
  });

  it("withholds conflicting prices or sale types for the same property and day", async () => {
    for (const conflict of [{ sale_price: 2_000_000 }, { sale_type: "family" }]) {
      const db = database([transaction(), transaction({ id: "conflict", source: "another-source", ...conflict })]);
      expect((await getComparables(db.client, "subject")).comparables).toEqual([]);
    }
  });
});

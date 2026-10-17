import { describe, expect, it } from "vitest";
import { buildPriceHistoryRows } from "./price-history";

const active = { status: "active" as const, price: 2_800_000, listingDate: "2026-09-01T08:00:00Z" };
const sale = (soldDate: string, price: number, saleType?: "normal" | "family" | "auction" | "other") => ({ soldDate, price, pricePerSqm: null, saleType });

describe("buildPriceHistoryRows", () => {
  it("sorts newest first and keeps sale types other than normal", () => {
    const rows = buildPriceHistoryRows({ property: active, sales: [sale("2020-09-30", 1_620_000), sale("2022-02-21", 2_220_000, "family")], originalAsking: { price: 2_900_000, date: "2026-09-01" } });
    expect(rows.map(r => [r.event, r.date])).toEqual([["listed", "2026-09-01"], ["original_asking", "2026-09-01"], ["sold", "2022-02-21"], ["sold", "2020-09-30"]]);
    expect(rows[2]!.saleType).toBe("family");
    expect(rows[3]!.saleType).toBeNull();
  });
  it("shows no listing rows for a home that is off the market", () => {
    const rows = buildPriceHistoryRows({ property: { ...active, status: "sold" }, sales: [sale("2021-04-16", 1_990_000)], originalAsking: { price: 2_900_000, date: null } });
    expect(rows.map(r => r.event)).toEqual(["sold"]);
  });
  it("puts undated rows last and drops invalid prices", () => {
    const rows = buildPriceHistoryRows({ property: active, sales: [sale("2019-01-01", 0), sale("2018-05-05", 1_500_000)], originalAsking: { price: 2_900_000, date: null } });
    expect(rows.map(r => r.date)).toEqual(["2026-09-01", "2018-05-05", null]);
    expect(rows).toHaveLength(3);
  });
  it("is empty with no evidence", () => {
    expect(buildPriceHistoryRows({ property: { status: "withdrawn", price: 1, listingDate: null }, sales: [], originalAsking: null })).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import type { SoldPriceEntry } from "@shared/types/index";
import { formatSaleDate, summarizeSales } from "./sales-history";

const sale = (soldDate: string, price: number, saleType?: SoldPriceEntry["saleType"], pricePerSqm: number | null = null): SoldPriceEntry =>
  ({ soldDate, price, pricePerSqm, ...(saleType ? { saleType } : {}) });

describe("summarizeSales", () => {
  it("puts the newest sale first whatever order it arrives in, and carries the year", () => {
    const { rows, latest } = summarizeSales([sale("2004-08-23", 1_495_000), sale("2019-02-01", 3_000_000), sale("2012-05-10", 2_100_000)]);
    expect(rows.map((r) => r.soldDate)).toEqual(["2019-02-01", "2012-05-10", "2004-08-23"]);
    expect(rows.map((r) => r.year)).toEqual([2019, 2012, 2004]);
    expect(latest).toMatchObject({ soldDate: "2019-02-01", year: 2019, price: 3_000_000 });
  });

  it("has no latest sale for a home with no registered sales", () => {
    expect(summarizeSales([])).toEqual({ rows: [], latest: null, latestFreeTrade: null });
  });

  it("reads a sale with no recorded type as an ordinary one", () => {
    expect(summarizeSales([sale("2019-02-01", 3_000_000)]).latest?.saleType).toBe("normal");
  });

  it("points to the newest arm's-length sale when the latest is a family transfer or an auction", () => {
    const summary = summarizeSales([sale("2023-01-01", 500_000, "family"), sale("2019-02-01", 3_000_000, "normal"), sale("2004-08-23", 1_495_000, "normal")]);
    expect(summary.latest).toMatchObject({ saleType: "family", price: 500_000 });
    expect(summary.latestFreeTrade).toMatchObject({ saleType: "normal", soldDate: "2019-02-01" });
    expect(summarizeSales([sale("2023-01-01", 400_000, "auction"), sale("2019-02-01", 3_000_000, "normal")]).latestFreeTrade?.price).toBe(3_000_000);
  });

  it("adds no arm's-length pointer when the latest already is one, or when there is nothing older to point to", () => {
    expect(summarizeSales([sale("2023-01-01", 3_000_000, "normal"), sale("2004-01-01", 1_000_000, "normal")]).latestFreeTrade).toBeNull();
    expect(summarizeSales([sale("2023-01-01", 500_000, "family"), sale("2004-01-01", 100_000, "auction")]).latestFreeTrade).toBeNull();
    expect(summarizeSales([sale("2023-01-01", 500_000, "family")]).latestFreeTrade).toBeNull();
  });

  it("drops rows with an unusable date or price instead of showing a made-up sale", () => {
    const { rows } = summarizeSales([sale("2019-02-01", 3_000_000), sale("2019-02", 1), sale("not a date", 1), sale("2018-01-01", 0), sale("2017-01-01", Number.NaN), sale("20190201", 5)]);
    expect(rows.map((r) => r.soldDate)).toEqual(["2019-02-01"]);
  });

  it("keeps a price per square metre only when it is a real number", () => {
    const { rows } = summarizeSales([sale("2019-02-01", 3_000_000, "normal", 20_000), sale("2012-01-01", 2_000_000, "normal", 0), sale("2004-01-01", 1_000_000, "normal", Number.NaN)]);
    expect(rows.map((r) => r.pricePerSqm)).toEqual([20_000, null, null]);
  });
});

describe("formatSaleDate", () => {
  it("writes the full date in the page's language, year included", () => {
    expect(formatSaleDate("2018-09-15", "da")).toBe("15. september 2018");
    expect(formatSaleDate("2018-09-15", "en")).toBe("15 September 2018");
  });

  it("has a short form without the year, for a table that has a year column", () => {
    expect(formatSaleDate("2018-09-15", "da", "short")).toMatch(/^15\. sep/);
    expect(formatSaleDate("2018-09-15", "da", "short")).not.toContain("2018");
  });

  it("does not shift a date across midnight in any time zone", () => {
    expect(formatSaleDate("2019-01-01", "da")).toBe("1. januar 2019");
    expect(formatSaleDate("2019-12-31", "en")).toBe("31 December 2019");
  });

  it("returns an impossible date as it came instead of rolling it over", () => {
    expect(formatSaleDate("2019-02-31", "da")).toBe("2019-02-31");
    expect(formatSaleDate("garbage", "en")).toBe("garbage");
  });
});

import { describe, expect, it } from "vitest";
import {
  assertSnapshotIntegrity,
  compoundAnnualGrowth,
  monthOverMonthVolatility,
  monthlySeries,
  pearsonCorrelation,
  percentChange,
  seasonalDeviation,
  shiftMonth,
  summarizeZipMarket,
  trailingAverage,
  yearlyAverages,
  zipMarketSnapshot,
  type ZipMarketSnapshot,
} from "@shared/analysis/zip-market-stats";

describe("postcode 9000 market snapshot", () => {
  it("covers every month from 2011-01 to 2026-09 for every series without gaps", () => {
    expect(() => assertSnapshotIntegrity()).not.toThrow();
    for (const metric of Object.keys(zipMarketSnapshot.series) as (keyof typeof zipMarketSnapshot.series)[]) {
      const months = monthlySeries(metric);
      expect(months).toHaveLength(189);
      expect(months[0]?.month).toBe("2011-01");
      expect(months.at(-1)?.month).toBe("2026-09");
    }
  });

  it("rejects a snapshot with a missing month", () => {
    const broken: ZipMarketSnapshot = structuredClone(zipMarketSnapshot);
    delete broken.series.sold_per_area_price.points["2019-06"];
    expect(() => assertSnapshotIntegrity(broken)).toThrow(/2019-06/);
  });

  it("reproduces the year-over-year figures reported by the source for the latest month", () => {
    const summary = summarizeZipMarket();
    expect(summary.latestMonth).toBe("2026-09");
    // Source: sold price 27,690 vs 24,091 a year earlier, previousYear.difference.percentage 14.94.
    expect(summary.latest.sold_per_area_price.yoyPercent).toBeCloseTo(14.94, 2);
    // Source: time on market 150 vs 98, percentage 53.06.
    expect(summary.latest.sold_time_on_market.yoyPercent).toBeCloseTo(53.06, 2);
    // Source: villas for sale 161 vs 193, absolute -32.
    expect(summary.latest.amount_for_sale.yoyAbsolute).toBe(-32);
    // Source: sold price previousMonth.difference.percentage -0.23.
    expect(summary.latest.sold_per_area_price.momPercent).toBeCloseTo(-0.23, 2);
  });

  it("labels 2026 as a partial year and gives 2011-2025 as the full-year growth window", () => {
    const summary = summarizeZipMarket();
    expect(summary.yearly.find((row) => row.year === 2026)?.months).toBe(9);
    expect(summary.yearly.find((row) => row.year === 2025)?.months).toBe(12);
    expect(summary.soldPriceCagr.fromYear).toBe(2011);
    expect(summary.soldPriceCagr.toYear).toBe(2025);
    expect(summary.soldPriceCagr.rate).toBeGreaterThan(0);
  });
});

describe("statistics helpers", () => {
  it("shifts months across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-09", -12)).toBe("2025-09");
    expect(shiftMonth("2011-01", 11)).toBe("2011-12");
  });

  it("computes percent change and refuses a zero or missing base", () => {
    expect(percentChange(110, 100)).toBeCloseTo(10);
    expect(percentChange(90, 100)).toBeCloseTo(-10);
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(null, 100)).toBeNull();
  });

  it("returns a trailing average only when all twelve months are present", () => {
    const points = Array.from({ length: 12 }, (_, i) => ({ month: shiftMonth("2025-01", i), value: 100 + i }));
    expect(trailingAverage(points, "2025-12")).toBeCloseTo(105.5);
    expect(trailingAverage(points.slice(1), "2025-12")).toBeNull();
  });

  it("averages by calendar year and records how many months each year has", () => {
    const points = [
      { month: "2024-01", value: 10 }, { month: "2024-02", value: 20 }, { month: "2025-01", value: 30 },
    ];
    expect(yearlyAverages(points)).toEqual([
      { year: 2024, average: 15, months: 2 },
      { year: 2025, average: 30, months: 1 },
    ]);
  });

  it("compounds annual growth and rejects non-positive inputs", () => {
    expect(compoundAnnualGrowth(100, 121, 2)).toBeCloseTo(0.1);
    expect(compoundAnnualGrowth(0, 121, 2)).toBeNull();
  });

  it("measures month-over-month volatility as zero for a flat series", () => {
    const flat = Array.from({ length: 6 }, (_, i) => ({ month: shiftMonth("2025-01", i), value: 50 }));
    expect(monthOverMonthVolatility(flat)).toBe(0);
  });

  it("uses only full years for seasonality, so a partial year cannot skew the pattern", () => {
    const fullYear = Array.from({ length: 12 }, (_, i) => ({ month: shiftMonth("2025-01", i), value: i === 11 ? 110 : 100 }));
    const partial = [{ month: "2026-01", value: 1_000 }];
    const pattern = seasonalDeviation([...fullYear, ...partial]);
    const annualAverage = (11 * 100 + 110) / 12;
    expect(pattern[11]?.deviationPercent).toBeCloseTo((110 / annualAverage - 1) * 100);
    expect(pattern[0]?.deviationPercent).toBeCloseTo((100 / annualAverage - 1) * 100);
  });

  it("returns Pearson correlation over shared months and null for constant series", () => {
    const x = [{ month: "2025-01", value: 1 }, { month: "2025-02", value: 2 }, { month: "2025-03", value: 3 }];
    const up = x.map((point) => ({ month: point.month, value: point.value * 10 }));
    const down = x.map((point) => ({ month: point.month, value: -point.value }));
    expect(pearsonCorrelation(x, up)?.r).toBeCloseTo(1);
    expect(pearsonCorrelation(x, down)?.r).toBeCloseTo(-1);
    expect(pearsonCorrelation(x, x.map((point) => ({ month: point.month, value: 7 })))).toBeNull();
  });
});

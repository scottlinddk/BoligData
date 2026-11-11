import { describe, expect, it } from "vitest";
import {
  buildTimingMonths,
  detrend,
  latestVsTypical,
  monthRuns,
  monthSignals,
  waitingCost,
} from "@shared/analysis/zip-market-timing";
import { statSeries } from "@shared/analysis/zip-market-relationships";

describe("detrend and monthSignals", () => {
  it("removes a steady trend so a pure trend has no season", () => {
    const points = Array.from({ length: 96 }, (_, i) => ({ month: `${2011 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, value: 100 * 1.005 ** i }));
    const signals = monthSignals(points, "percent");
    for (const s of signals) expect(Math.abs(s.mean)).toBeLessThan(0.1);
  });

  it("finds a planted season and calls it reliable", () => {
    const points = Array.from({ length: 144 }, (_, i) => {
      const m = i % 12;
      return { month: `${2011 + Math.floor(i / 12)}-${String(m + 1).padStart(2, "0")}`, value: 100 + i * 0.2 + (m === 0 ? 10 : 0) + (m === 6 ? -10 : 0) };
    });
    const signals = monthSignals(points, "percent");
    expect(signals[0]!.mean).toBeGreaterThan(5);
    expect(signals[0]!.reliable).toBe(true);
    expect(signals[6]!.mean).toBeLessThan(-5);
    expect(signals[3]!.reliable).toBe(false);
  });

  it("drops six months at each end", () => {
    const sold = statSeries("sold");
    expect(detrend(sold, "percent")).toHaveLength(sold.length - 12);
  });
});

describe("monthRuns", () => {
  it("joins december and january", () => {
    expect(monthRuns([12, 1, 2, 7])).toEqual([[7], [12, 1, 2]]);
    expect(monthRuns([1, 2, 3])).toEqual([[1, 2, 3]]);
    expect(monthRuns([])).toEqual([]);
    expect(monthRuns([3, 5])).toEqual([[3], [5]]);
  });
  it("returns the whole year as one run", () => {
    expect(monthRuns(Array.from({ length: 12 }, (_, i) => i + 1))[0]).toHaveLength(12);
  });
});

describe("the 9000 Aalborg timing guide", () => {
  const months = buildTimingMonths();
  const by = (n: number) => months[n - 1]!;

  it("has twelve months with 14-15 years behind each", () => {
    expect(months).toHaveLength(12);
    for (const m of months) {
      expect(m.signals.daysOnMarket.years).toBeGreaterThanOrEqual(14);
      expect(m.signals.daysOnMarket.years).toBeLessThanOrEqual(15);
    }
  });

  it("shows the winter pattern in days on market as reliable", () => {
    for (const n of [1, 2, 3]) {
      expect(by(n).signals.daysOnMarket.mean).toBeGreaterThan(8);
      expect(by(n).signals.daysOnMarket.reliable).toBe(true);
    }
    for (const n of [6, 7, 8, 9]) {
      expect(by(n).signals.daysOnMarket.mean).toBeLessThan(-5);
    }
  });

  it("gives buyers most leverage in the winter and least in summer", () => {
    const rank = [...months].sort((a, b) => b.leverage - a.leverage).map((m) => m.month);
    expect(rank.slice(0, 4).sort((a, b) => a - b)).toEqual(expect.arrayContaining([1, 2]));
    expect(rank.slice(-4)).toEqual(expect.arrayContaining([6, 8]));
  });

  it("offers most choice in summer and autumn and least in winter", () => {
    expect(by(6).selection).toBeGreaterThan(by(1).selection);
    expect(by(9).selection).toBeGreaterThan(by(2).selection);
    expect(by(2).signals.supply.reliable).toBe(true);
  });

  it("does not claim a reliable season in the sold price", () => {
    expect(months.some((m) => m.signals.sold.reliable)).toBe(false);
  });

  it("z-scores average to zero for each signal", () => {
    for (const key of ["daysOnMarket", "discount", "supply"] as const) {
      const mean = months.reduce((a, m) => a + m.favourability[key], 0) / 12;
      expect(Math.abs(mean)).toBeLessThan(1e-9);
    }
  });
});

describe("waitingCost and latestVsTypical", () => {
  const cost = waitingCost(buildTimingMonths());
  it("sets the season against the market's own movement", () => {
    expect(cost.latestMonth).toBe("2026-10");
    expect(cost.yearOverYearPercent).toBeCloseTo(4.6, 1);
    expect(cost.seasonalSpreadPercent).toBeLessThan(5);
    expect(cost.seasonalPriceReliable).toBe(false);
  });

  it("compares the latest month with the same month in earlier years", () => {
    const days = latestVsTypical("daysOnMarket")!;
    expect(days.month).toBe("2026-10");
    expect(days.value).toBe(103);
    expect(days.years).toBe(5);
    expect(days.favoursBuyer).toBe(days.difference > 0);
    const discount = latestVsTypical("discount")!;
    expect(discount.mode).toBe("absolute");
  });
});

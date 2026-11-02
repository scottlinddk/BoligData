import { describe, expect, it } from "vitest";
import {
  FORECAST_METHODS,
  HORIZON,
  MIN_ORIGIN_MONTHS,
  SINGLE_METHOD_MARGIN,
  backtest,
  buildForecast,
  fitForecast,
  pathFor,
  projectPath,
  quantile,
  seasonalFactors,
} from "@shared/analysis/zip-market-forecast";
import { monthlySeries, shiftMonth } from "@shared/analysis/zip-market-stats";

const points = monthlySeries("sold_per_area_price");

describe("quantile", () => {
  it("interpolates and handles the ends", () => {
    expect(quantile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4, 5], 1)).toBe(5);
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([0, 10], 0.25)).toBe(2.5);
  });
});

describe("seasonalFactors", () => {
  it("has twelve factors averaging 1", () => {
    const s = seasonalFactors(points);
    expect(s).toHaveLength(12);
    expect(s.reduce((a, b) => a + b, 0) / 12).toBeCloseTo(1, 10);
  });
});

describe("a pure trend with no season", () => {
  // 3% a year, smooth, 10 years
  const smooth = Array.from({ length: 120 }, (_, i) => ({ month: shiftMonth("2010-01", i), value: 20_000 * 1.03 ** (i / 12) }));

  it("is recovered by the long-run method", () => {
    const fit = fitForecast(smooth, "longrun");
    expect(fit.growth).toBeCloseTo(0.03, 3);
    const path = projectPath(fit);
    const expected = 20_000 * 1.03 ** ((120 + 5) / 12);
    expect(path[5]!.value / expected).toBeGreaterThan(0.99);
    expect(path[5]!.value / expected).toBeLessThan(1.01);
  });

  it("keeps flat flat and puts the blend between flat and momentum", () => {
    const flat = pathFor(smooth, "flat")[11]!.value;
    const blend = pathFor(smooth, "blend")[11]!.value;
    const momentum = pathFor(smooth, "momentum")[11]!.value;
    expect(blend).toBeGreaterThan(Math.min(flat, momentum));
    expect(blend).toBeLessThanOrEqual(Math.max(flat, momentum, pathFor(smooth, "longrun")[11]!.value));
  });
});

describe("no look-ahead", () => {
  it("a fit on history does not change when later months are appended and then ignored", () => {
    const cut = points.slice(0, 120);
    const a = pathFor(cut, "blend");
    const b = pathFor(points.slice(0, 120), "blend");
    expect(a).toEqual(b);
  });

  it("backtest origins start only after the minimum history and end a full horizon before the data does", () => {
    const run = backtest(points, "flat");
    expect(run.origins).toBe(points.length - HORIZON - MIN_ORIGIN_MONTHS + 1);
    expect(run.monthlyErrors).toHaveLength(HORIZON);
    expect(run.monthlyErrors.every((e) => e.length === run.origins)).toBe(true);
  });

  it("changing only the final twelve months changes no backtest origin that stops before them", () => {
    const tampered = points.map((p, i) => (i >= points.length - HORIZON ? { ...p, value: p.value * 3 } : p));
    const a = backtest(points, "longrun").annualErrors;
    const b = backtest(tampered, "longrun").annualErrors;
    // The last origin is the only one whose target lies wholly in the tampered months.
    expect(a.slice(0, -1).filter((v, i) => v !== b[i]).length).toBeLessThan(a.length - 1);
    expect(a[0]).toBe(b[0]);
  });
});

describe("buildForecast", () => {
  const report = buildForecast();

  it("forecasts the twelve months after the last observation", () => {
    expect(report.path).toHaveLength(12);
    expect(report.path[0]!.month).toBe(shiftMonth(report.lastMonth, 1));
    expect(report.path[11]!.month).toBe(shiftMonth(report.lastMonth, 12));
  });

  it("keeps the range around the forecast, and the average inside its range", () => {
    for (const p of report.path) {
      expect(p.lo).toBeLessThan(p.value);
      expect(p.hi).toBeGreaterThan(p.value);
      expect(Number.isFinite(p.lo) && Number.isFinite(p.hi)).toBe(true);
    }
    expect(report.nextYearAverage.lo).toBeLessThan(report.nextYearAverage.value);
    expect(report.nextYearAverage.hi).toBeGreaterThan(report.nextYearAverage.value);
  });

  it("states changes consistently with the levels they are measured against", () => {
    expect(report.changePercent.value).toBeCloseTo((report.nextYearAverage.value / report.lastYearAverage - 1) * 100, 8);
    expect(report.changeFromLevelPercent.value).toBeCloseTo((report.nextYearAverage.value / report.currentLevel - 1) * 100, 8);
  });

  it("tests every method on the same origins", () => {
    expect(report.backtests.map((b) => b.method)).toEqual(FORECAST_METHODS);
    expect(new Set(report.backtests.map((b) => b.origins)).size).toBe(1);
  });

  it("shows the blend unless a single method beats it by the stated margin", () => {
    const blend = report.backtests.find((b) => b.method === "blend")!;
    const best = report.backtests.filter((b) => b.method !== "blend").reduce((a, b) => (b.mae < a.mae ? b : a));
    const expected = best.mae < blend.mae * (1 - SINGLE_METHOD_MARGIN) ? best.method : "blend";
    expect(report.method).toBe(expected);
  });

  it("uses an 80% range that the backtest actually covered about 80% of the time", () => {
    const run = report.backtests.find((b) => b.method === report.method)!;
    const lo = quantile(run.annualErrors, 0.1);
    const hi = quantile(run.annualErrors, 0.9);
    const inside = run.annualErrors.filter((e) => e >= lo && e <= hi).length / run.annualErrors.length;
    expect(inside).toBeGreaterThan(0.75);
    expect(inside).toBeLessThan(0.9);
  });
});

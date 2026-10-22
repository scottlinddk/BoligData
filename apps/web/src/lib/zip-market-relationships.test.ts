import { describe, expect, it } from "vitest";
import {
  MARKET_PHASES,
  analyzeRelationships,
  correlationStrength,
  laggedCorrelation,
  lastMonthAtOrAbove,
  largestMonthOverMonthMove,
  percentileRank,
  seriesYearOverYear,
  statSeries,
  strongestLag,
  summarizePhase,
  summarizePhases,
  yearOverYear,
  type LeadLagResult,
  type StatSeriesKey,
} from "@shared/analysis/zip-market-relationships";
import { monthlySeries, shiftMonth, zipMarketSnapshot } from "@shared/analysis/zip-market-stats";

const series = (values: number[], start = "2024-01") => values.map((value, i) => ({ month: shiftMonth(start, i), value }));

describe("year-over-year and lagged correlation helpers", () => {
  it("computes percent and absolute 12-month changes and skips months without a base", () => {
    const points = series(Array.from({ length: 14 }, (_, i) => 100 + i * 10));
    expect(yearOverYear(points, true)).toHaveLength(2);
    expect(yearOverYear(points, true)[0]).toEqual({ month: "2025-01", value: 120 });
    expect(yearOverYear(points, false)[0]).toEqual({ month: "2025-01", value: 120 });
    expect(yearOverYear(series([100, 200]), true)).toEqual([]);
  });

  it("finds the lag at which one series follows another", () => {
    const leader = series([1, 5, 2, 8, 3, 9, 4, 7, 2, 6, 1, 8]);
    const follower = leader.map((point) => ({ month: shiftMonth(point.month, 3), value: point.value * 2 }));
    const best = strongestLag([-3, 0, 3, 6].map((lag) => laggedCorrelation(leader, follower, lag)));
    expect(best?.lag).toBe(3);
    expect(best?.r).toBeCloseTo(1, 5);
  });

  it("returns null correlations instead of NaN for constant or too-short input", () => {
    expect(laggedCorrelation(series([1, 1, 1, 1]), series([1, 2, 3, 4]), 0).r).toBeNull();
    expect(laggedCorrelation(series([1, 2]), series([1, 2]), 0).r).toBeNull();
  });

  it("buckets correlation strength by absolute value", () => {
    expect(correlationStrength(0.1)).toBe("negligible");
    expect(correlationStrength(-0.3)).toBe("weak");
    expect(correlationStrength(0.5)).toBe("moderate");
    expect(correlationStrength(-0.8)).toBe("strong");
    expect(correlationStrength(null)).toBe("negligible");
  });

  it("ranks a value among the months, counting ties as half", () => {
    const points = series([1, 2, 3, 4]);
    expect(percentileRank(points, 4)).toBeCloseTo(87.5);
    expect(percentileRank(points, 0)).toBe(0);
    expect(percentileRank(points, 2)).toBeCloseTo(37.5);
  });
});

describe("discount and move helpers", () => {
  it("presents the discount as a positive size, so a larger discount reads as up", () => {
    expect(statSeries("discount")[0]).toEqual({ month: "2011-01", value: 498 });
    expect(monthlySeries("sold_per_area_price_change")[0]!.value).toBe(-498);
  });

  it("finds the last earlier month at or above a value", () => {
    const points = series([5, 9, 3, 9, 4]);
    expect(lastMonthAtOrAbove(points, 9, "2024-05")).toBe("2024-04");
    expect(lastMonthAtOrAbove(points, 9, "2024-04")).toBe("2024-02");
    expect(lastMonthAtOrAbove(points, 10, "2024-05")).toBeNull();
  });

  it("finds the largest month-over-month move inside a window", () => {
    const points = series([100, 101, 130, 129, 90]);
    expect(largestMonthOverMonthMove(points)?.month).toBe("2024-05");
    expect(largestMonthOverMonthMove(points)?.changePercent).toBeCloseTo(-30.23, 1);
    expect(largestMonthOverMonthMove(points, { to: "2024-04" })?.month).toBe("2024-03");
    expect(largestMonthOverMonthMove(points, { to: "2024-04" })?.changePercent).toBeCloseTo(28.71, 1);
    expect(largestMonthOverMonthMove(series([1]))).toBeNull();
  });
});

describe("market phases", () => {
  it("cover the whole snapshot period back to back without gaps or overlaps", () => {
    expect(MARKET_PHASES[0]!.from).toBe(zipMarketSnapshot.period.from);
    expect(MARKET_PHASES.at(-1)!.to).toBe(zipMarketSnapshot.period.to);
    MARKET_PHASES.slice(1).forEach((phase, i) => {
      expect(phase.from).toBe(shiftMonth(MARKET_PHASES[i]!.to, 1));
    });
    expect(summarizePhases().reduce((sum, p) => sum + p.months, 0)).toBe(189);
  });

  // The page text states what happened in each phase. These pin the facts it relies on,
  // so a refreshed snapshot that changes the story fails here before the prose goes stale.
  const phase = (id: string) => summarizePhase(MARKET_PHASES.find((p) => p.id === id)!);

  it("soft-bottom ends at the sold price low and recovery starts from it", () => {
    const all = statSeries("sold");
    const low = all.reduce((a, b) => (b.value < a.value ? b : a));
    expect(low.month).toBe(phase("soft-bottom").phase.to);
    expect(phase("recovery").metrics.sold.changePercent).toBeGreaterThan(25);
    expect(phase("recovery").metrics.supply.changePercent).toBeLessThan(-20);
    expect(phase("recovery").metrics.daysOnMarket.changePercent).toBeLessThan(-20);
  });

  it("plateau: supply and discount widen while the asking price turns down", () => {
    const p = phase("plateau").metrics;
    expect(p.supply.changePercent).toBeGreaterThan(30);
    expect(p.discount.changePercent).toBeGreaterThan(50);
    expect(p.asking.max.month).toBe("2019-04");
    expect(p.asking.end).toBeLessThan(p.asking.max.value);
  });

  it("covid-dip: asking prices end the year above where they started, with supply and discount down", () => {
    const p = phase("covid-dip").metrics;
    expect(p.asking.changePercent).toBeGreaterThan(0);
    expect(p.supply.changePercent).toBeLessThan(0);
    expect(p.discount.changePercent).toBeLessThan(0);
  });

  it("covid-dip: the sold price falls far more than the asking price in the same months", () => {
    const p = phase("covid-dip").metrics;
    const soldDrop = (p.sold.min.value / statSeries("sold").find((x) => x.month === "2020-01")!.value - 1) * 100;
    const askingDrop = (p.asking.min.value / statSeries("asking").find((x) => x.month === "2020-01")!.value - 1) * 100;
    expect(p.sold.min.month).toBe("2020-05");
    expect(soldDrop).toBeLessThan(-15);
    expect(askingDrop).toBeGreaterThan(-3);
  });

  it("squeeze-boom holds the all-time supply low and the shortest time on market", () => {
    const supplyAll = statSeries("supply");
    const tomAll = statSeries("daysOnMarket");
    expect(Math.min(...supplyAll.map((x) => x.value))).toBe(94);
    expect(phase("squeeze-boom").metrics.supply.min.value).toBe(94);
    expect(Math.min(...tomAll.map((x) => x.value))).toBe(phase("squeeze-boom").metrics.daysOnMarket.min.value);
    expect(phase("squeeze-boom").metrics.asking.max.month).toBe("2022-08");
  });

  it("cooling: supply up, days on market up, sold price down", () => {
    const p = phase("cooling").metrics;
    expect(p.supply.changePercent).toBeGreaterThan(25);
    expect(p.daysOnMarket.changePercent).toBeGreaterThan(40);
    expect(p.sold.changePercent).toBeLessThan(0);
    expect(p.sold.min.month).toBe("2023-06");
  });

  it("slow-high-supply holds the supply peak; price-rebound lifts asking and sold prices as supply falls", () => {
    expect(phase("slow-high-supply").metrics.supply.max.value).toBe(227);
    const p = phase("price-rebound").metrics;
    expect(p.asking.changePercent).toBeGreaterThan(10);
    expect(p.sold.changePercent).toBeGreaterThan(15);
    expect(p.supply.changePercent).toBeLessThan(0);
    // Days on market rose in the same phase: the page flags this as the one series that did not follow prices.
    expect(p.daysOnMarket.changePercent).toBeGreaterThan(0);
  });
});

describe("relationships between the series", () => {
  const report = analyzeRelationships();
  const pair = (a: StatSeriesKey, b: StatSeriesKey, source = report.changeCorrelations) =>
    source.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a))!;
  const lead = (leader: StatSeriesKey, follower: StatSeriesKey): LeadLagResult =>
    report.leadLag.find((l) => l.leader === leader && l.follower === follower)!;

  it("computes every lead/lag pair the stats page looks up", () => {
    const pairs = report.leadLag.map((l) => `${l.leader}>${l.follower}`);
    for (const wanted of ["asking>sold", "supply>asking", "supply>sold", "supply>daysOnMarket", "supply>discount", "daysOnMarket>sold", "discount>sold"]) {
      expect(pairs).toContain(wanted);
    }
    expect(report.leadLag.every((l) => l.profile.length === 19 && l.best !== null)).toBe(true);
  });

  it("reports all ten pairs, on 177 twelve-month changes (189 months less the first 12)", () => {
    expect(report.changeCorrelations).toHaveLength(10);
    expect(report.changeCorrelations.every((p) => p.n === 177)).toBe(true);
    expect(report.annualCorrelations.every((p) => p.n === 14)).toBe(true);
  });

  it("asking and sold prices move together, in changes and in annual averages", () => {
    expect(pair("asking", "sold").r).toBeGreaterThan(0.4);
    expect(pair("asking", "sold", report.annualCorrelations).r).toBeGreaterThan(0.6);
  });

  it("asking price changes lead sold price changes by a few months, in both halves of the history", () => {
    const result = lead("asking", "sold");
    expect(result.best!.lag).toBeGreaterThanOrEqual(2);
    expect(result.best!.lag).toBeLessThanOrEqual(4);
    expect(result.best!.r!).toBeGreaterThan(0.6);
    expect(result.best!.r!).toBeGreaterThan(result.sameMonth.r! + 0.1);
    expect(result.halves!.first).toBeGreaterThan(0.4);
    expect(result.halves!.second).toBeGreaterThan(0.4);
    // The relationship is one-directional in the data: the sold price does not lead the asking price.
    const reverse = result.profile.filter((p) => p.lag <= -3).map((p) => p.r!);
    expect(Math.max(...reverse)).toBeLessThan(0.3);
  });

  it("more villas for sale go with lower asking prices, in changes and annual averages, in both halves", () => {
    expect(pair("supply", "asking").r).toBeLessThan(-0.4);
    expect(pair("supply", "asking", report.annualCorrelations).r).toBeLessThan(-0.4);
    const result = lead("supply", "asking");
    expect(result.best!.r!).toBeLessThan(-0.5);
    expect(result.halves!.first).toBeLessThan(-0.4);
    expect(result.halves!.second).toBeLessThan(-0.4);
  });

  it("the supply link to the sold price is weak early on and clearer later", () => {
    const result = lead("supply", "sold");
    expect(result.halves!.first).toBeGreaterThan(-0.2);
    expect(result.halves!.second).toBeLessThan(-0.3);
  });

  it("the supply link to days on market is clearer in the second half than the first", () => {
    const result = lead("supply", "daysOnMarket");
    expect(result.halves!.second!).toBeGreaterThan(result.halves!.first! + 0.2);
  });

  it("a larger discount goes with more supply and with falling asking prices; it leads sold prices with a changing strength", () => {
    expect(pair("supply", "discount").r).toBeGreaterThan(0.15);
    expect(pair("asking", "discount").r).toBeLessThan(-0.2);
    const result = lead("discount", "sold");
    expect(result.best!.r!).toBeLessThan(-0.4);
    expect(result.best!.lag).toBeGreaterThan(0);
    expect(Math.abs(result.halves!.second! - result.halves!.first!)).toBeGreaterThan(0.25);
  });

  it("sold price changes lead days-on-market changes, not the other way round", () => {
    const result = lead("daysOnMarket", "sold");
    expect(result.best!.lag).toBeLessThan(0);
    expect(result.best!.r!).toBeLessThan(-0.25);
  });

  it("supply is related to the sold price more weakly than to the asking price", () => {
    expect(Math.abs(pair("supply", "sold").r!)).toBeLessThan(Math.abs(pair("supply", "asking").r!));
    expect(pair("supply", "sold").r).toBeLessThan(-0.2);
  });

  it("more supply goes with longer time on market", () => {
    expect(pair("supply", "daysOnMarket").r).toBeGreaterThan(0.2);
    expect(pair("supply", "daysOnMarket", report.annualCorrelations).r).toBeGreaterThan(0.5);
  });

  it("the average discount is nearly unrelated to sold price changes", () => {
    expect(Math.abs(pair("sold", "discount").r!)).toBeLessThan(0.2);
  });

  it("monthly sold prices are several times as volatile as asking prices", () => {
    expect(report.monthlyVolatility.sold! / report.monthlyVolatility.asking!).toBeGreaterThan(2.5);
  });

  it("uses the snapshot passed in rather than the bundled one", () => {
    const flat = structuredClone(zipMarketSnapshot);
    for (const key of Object.keys(flat.series.per_area_price.points)) flat.series.per_area_price.points[key] = 100;
    expect(seriesYearOverYear("asking", flat).every((p) => p.value === 0)).toBe(true);
    expect(analyzeRelationships(flat).changeCorrelations.find((p) => p.a === "asking" && p.b === "sold")!.r).toBeNull();
    expect(monthlySeries("per_area_price", zipMarketSnapshot)[0]!.value).toBe(19536);
  });
});

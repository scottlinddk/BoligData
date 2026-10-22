import snapshotJson from "../data/boligsiden-zip-9000-stats.json" with { type: "json" };

/**
 * Monthly Boligsiden Markedsindeks statistics for one postcode (9000 Aalborg).
 * Pure functions only: the snapshot is imported, never fetched, so the numbers
 * stay reproducible and the module is safe to use in both server and browser code.
 */

export const ZIP_MARKET_METRICS = [
  "per_area_price",
  "amount_for_sale",
  "sold_per_area_price",
  "sold_time_on_market",
  "sold_per_area_price_change",
] as const;
export type ZipMarketMetric = (typeof ZIP_MARKET_METRICS)[number];

export interface ZipMarketSeriesSnapshot {
  addressType: string;
  unit: string;
  description: string;
  points: Record<string, number>;
}

export interface ZipMarketSnapshot {
  source: { name: string; endpoint: string; locationType: string; locationName: string; municipality: string; capturedAt: string | null; note: string };
  period: { from: string; to: string };
  series: Record<ZipMarketMetric, ZipMarketSeriesSnapshot>;
}

export interface MonthlyPoint {
  /** Calendar month, "YYYY-MM". */
  month: string;
  value: number;
}

export interface YearlyAverage {
  year: number;
  average: number;
  /** Number of months with data in the year; 12 means a full year. */
  months: number;
}

export const zipMarketSnapshot = snapshotJson as ZipMarketSnapshot;

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthIndex(month: string): number {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
}

function monthFromIndex(index: number): string {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Calendar month `delta` months away from `month`, e.g. shiftMonth("2026-01", -1) === "2025-12". */
export function shiftMonth(month: string, delta: number): string {
  return monthFromIndex(monthIndex(month) + delta);
}

function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let index = monthIndex(from); index <= monthIndex(to); index++) months.push(monthFromIndex(index));
  return months;
}

/**
 * Throws when the snapshot has a gap, a duplicate, an unexpected key or a
 * non-finite value. A structural problem should fail the test run, not
 * quietly skew a headline number.
 */
export function assertSnapshotIntegrity(snapshot: ZipMarketSnapshot = zipMarketSnapshot): void {
  const expected = monthsBetween(snapshot.period.from, snapshot.period.to);
  for (const metric of ZIP_MARKET_METRICS) {
    const series = snapshot.series[metric];
    if (!series) throw new Error(`Missing series ${metric}`);
    const keys = Object.keys(series.points);
    const unexpected = keys.filter((key) => !MONTH_PATTERN.test(key));
    if (unexpected.length) throw new Error(`Invalid month keys in ${metric}: ${unexpected.join(", ")}`);
    const missing = expected.filter((month) => !(month in series.points));
    if (missing.length) throw new Error(`Missing months in ${metric}: ${missing.join(", ")}`);
    const extra = keys.filter((key) => !expected.includes(key));
    if (extra.length) throw new Error(`Months outside the declared period in ${metric}: ${extra.join(", ")}`);
    for (const [month, value] of Object.entries(series.points)) {
      if (!Number.isFinite(value)) throw new Error(`Non-finite value for ${metric} ${month}`);
    }
  }
}

/** Sorted monthly points for one metric. */
export function monthlySeries(metric: ZipMarketMetric, snapshot: ZipMarketSnapshot = zipMarketSnapshot): MonthlyPoint[] {
  return Object.entries(snapshot.series[metric].points)
    .map(([month, value]) => ({ month, value }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function valueAt(points: MonthlyPoint[], month: string): number | null {
  return points.find((point) => point.month === month)?.value ?? null;
}

/** Percent change from `previous` to `current`, or null when there is no usable base. */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Mean per calendar year, keeping the month count so partial years can be labelled. */
export function yearlyAverages(points: MonthlyPoint[]): YearlyAverage[] {
  const byYear = new Map<number, number[]>();
  for (const point of points) {
    const year = Number(point.month.slice(0, 4));
    byYear.set(year, [...(byYear.get(year) ?? []), point.value]);
  }
  return [...byYear]
    .sort(([a], [b]) => a - b)
    .map(([year, values]) => ({
      year,
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
      months: values.length,
    }));
}

/** Mean of the `window` months ending at `endMonth`; null unless the whole window has data. */
export function trailingAverage(points: MonthlyPoint[], endMonth: string, window = 12): number | null {
  const months = monthsBetween(shiftMonth(endMonth, 1 - window), endMonth);
  const values = months.map((month) => valueAt(points, month));
  if (values.some((value) => value === null)) return null;
  return (values as number[]).reduce((sum, value) => sum + value, 0) / window;
}

/** Compound annual growth between two yearly averages. */
export function compoundAnnualGrowth(start: number, end: number, years: number): number | null {
  if (start <= 0 || end <= 0 || years <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

/** Sample standard deviation of month-over-month percent changes. */
export function monthOverMonthVolatility(points: MonthlyPoint[]): number | null {
  const changes: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const change = percentChange(points[i]!.value, points[i - 1]!.value);
    if (change !== null) changes.push(change);
  }
  if (changes.length < 2) return null;
  const mean = changes.reduce((sum, value) => sum + value, 0) / changes.length;
  const variance = changes.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (changes.length - 1);
  return Math.sqrt(variance);
}

/**
 * Average deviation of each calendar month from its own year's mean, using full
 * years only so a partial year cannot tilt the pattern. Index 0 is January.
 */
export function seasonalDeviation(points: MonthlyPoint[]): { month: number; deviationPercent: number }[] {
  const fullYears = new Map(yearlyAverages(points).filter((year) => year.months === 12).map((year) => [year.year, year.average]));
  const buckets = Array.from({ length: 12 }, () => [] as number[]);
  for (const point of points) {
    const year = Number(point.month.slice(0, 4));
    const average = fullYears.get(year);
    if (average === undefined) continue;
    buckets[Number(point.month.slice(5, 7)) - 1]!.push((point.value / average - 1) * 100);
  }
  return buckets.map((values, index) => ({
    month: index + 1,
    deviationPercent: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
  }));
}

/** Pearson correlation over months where both series have a value. */
export function pearsonCorrelation(a: MonthlyPoint[], b: MonthlyPoint[]): { r: number; n: number } | null {
  const bByMonth = new Map(b.map((point) => [point.month, point.value]));
  const pairs = a.flatMap((point) => {
    const other = bByMonth.get(point.month);
    return other === undefined ? [] : [[point.value, other] as const];
  });
  const n = pairs.length;
  if (n < 3) return null;
  const meanA = pairs.reduce((sum, [x]) => sum + x, 0) / n;
  const meanB = pairs.reduce((sum, [, y]) => sum + y, 0) / n;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (const [x, y] of pairs) {
    covariance += (x - meanA) * (y - meanB);
    varianceA += (x - meanA) ** 2;
    varianceB += (y - meanB) ** 2;
  }
  if (varianceA === 0 || varianceB === 0) return null;
  return { r: covariance / Math.sqrt(varianceA * varianceB), n };
}

export interface ZipMarketSummary {
  latestMonth: string;
  /** Latest month against the same month one year earlier, and against the previous month. */
  latest: Record<ZipMarketMetric, { value: number; yoyPercent: number | null; momPercent: number | null; yoyAbsolute: number | null }>;
  /** Trailing 12 months against the 12 months before that. */
  trailing12m: {
    soldPerAreaPrice: { current: number | null; previous: number | null; changePercent: number | null };
    askingPerAreaPrice: { current: number | null; previous: number | null; changePercent: number | null };
    soldTimeOnMarket: { current: number | null; previous: number | null; changePercent: number | null };
    soldDiscount: { current: number | null; previous: number | null; absoluteChange: number | null };
  };
  yearly: (YearlyAverage & { soldPerAreaPrice: number; askingPerAreaPrice: number; soldTimeOnMarket: number; soldDiscount: number; villasForSale: number })[];
  /** Compound growth of the average sold price per m² across full calendar years. */
  soldPriceCagr: { fromYear: number; toYear: number; rate: number | null };
  /** Volatility of month-over-month sold price changes, in percentage points. */
  soldPriceMomVolatility: number | null;
  seasonality: { month: number; deviationPercent: number }[];
  correlations: {
    timeOnMarketVsSoldPrice: { r: number; n: number } | null;
    discountVsSoldPrice: { r: number; n: number } | null;
    villasForSaleVsAskingPrice: { r: number; n: number } | null;
  };
}

/**
 * Headline statistics for the postcode. Asking-side and sold-side series use
 * different address types in the source (villa vs villa and terraced house),
 * so the summary compares them only where the source uses the same type.
 */
export function summarizeZipMarket(snapshot: ZipMarketSnapshot = zipMarketSnapshot): ZipMarketSummary {
  const latestMonth = snapshot.period.to;
  const previousMonth = shiftMonth(latestMonth, -1);
  const previousYearMonth = shiftMonth(latestMonth, -12);

  const series = Object.fromEntries(ZIP_MARKET_METRICS.map((metric) => [metric, monthlySeries(metric, snapshot)])) as Record<ZipMarketMetric, MonthlyPoint[]>;
  const latest = Object.fromEntries(ZIP_MARKET_METRICS.map((metric) => {
    const points = series[metric];
    const current = valueAt(points, latestMonth)!;
    const previousYear = valueAt(points, previousYearMonth);
    const previousMonthValue = valueAt(points, previousMonth);
    return [metric, {
      value: current,
      yoyPercent: percentChange(current, previousYear),
      momPercent: percentChange(current, previousMonthValue),
      yoyAbsolute: previousYear === null ? null : current - previousYear,
    }];
  })) as ZipMarketSummary["latest"];

  const trailing = (points: MonthlyPoint[]) => {
    const current = trailingAverage(points, latestMonth);
    const previous = trailingAverage(points, previousYearMonth);
    return { current, previous };
  };
  const soldTrailing = trailing(series.sold_per_area_price);
  const askingTrailing = trailing(series.per_area_price);
  const tomTrailing = trailing(series.sold_time_on_market);
  const discountTrailing = trailing(series.sold_per_area_price_change);

  const soldAverages = yearlyAverages(series.sold_per_area_price);
  const askingAverages = yearlyAverages(series.per_area_price);
  const tomAverages = yearlyAverages(series.sold_time_on_market);
  const discountAverages = yearlyAverages(series.sold_per_area_price_change);
  const supplyAverages = yearlyAverages(series.amount_for_sale);
  const yearly = soldAverages.map((row, index) => ({
    ...row,
    soldPerAreaPrice: row.average,
    askingPerAreaPrice: askingAverages[index]!.average,
    soldTimeOnMarket: tomAverages[index]!.average,
    soldDiscount: discountAverages[index]!.average,
    villasForSale: supplyAverages[index]!.average,
  }));

  const firstFullYear = soldAverages.find((row) => row.months === 12);
  const lastFullYear = [...soldAverages].reverse().find((row) => row.months === 12);
  const soldPriceCagr = firstFullYear && lastFullYear
    ? {
        fromYear: firstFullYear.year,
        toYear: lastFullYear.year,
        rate: compoundAnnualGrowth(firstFullYear.average, lastFullYear.average, lastFullYear.year - firstFullYear.year),
      }
    : { fromYear: 0, toYear: 0, rate: null };

  return {
    latestMonth,
    latest,
    trailing12m: {
      soldPerAreaPrice: { ...soldTrailing, changePercent: percentChange(soldTrailing.current, soldTrailing.previous) },
      askingPerAreaPrice: { ...askingTrailing, changePercent: percentChange(askingTrailing.current, askingTrailing.previous) },
      soldTimeOnMarket: { ...tomTrailing, changePercent: percentChange(tomTrailing.current, tomTrailing.previous) },
      soldDiscount: {
        current: discountTrailing.current,
        previous: discountTrailing.previous,
        absoluteChange: discountTrailing.current === null || discountTrailing.previous === null ? null : discountTrailing.current - discountTrailing.previous,
      },
    },
    yearly,
    soldPriceCagr,
    soldPriceMomVolatility: monthOverMonthVolatility(series.sold_per_area_price),
    seasonality: seasonalDeviation(series.sold_per_area_price),
    correlations: {
      timeOnMarketVsSoldPrice: pearsonCorrelation(series.sold_time_on_market, series.sold_per_area_price),
      discountVsSoldPrice: pearsonCorrelation(series.sold_per_area_price_change, series.sold_per_area_price),
      villasForSaleVsAskingPrice: pearsonCorrelation(series.amount_for_sale, series.per_area_price),
    },
  };
}

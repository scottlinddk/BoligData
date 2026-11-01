import {
  percentChange,
  shiftMonth,
  zipMarketSnapshot,
  type MonthlyPoint,
  type ZipMarketSnapshot,
} from "./zip-market-stats.js";
import { statSeries, type StatSeriesKey } from "./zip-market-relationships.js";

/**
 * Buyer timing: which calendar months favour a buyer, based on the monthly
 * postcode history. Pure functions, no I/O.
 *
 * Method. Each series is detrended against a centred 2x12 moving average, so a
 * rising or falling market does not masquerade as a season. What is left for a
 * calendar month is one deviation per year. We report the mean, how many years
 * agree on the direction, and a t-statistic. A month's signal only counts as
 * reliable when enough years agree and the mean is clearly larger than the
 * year-to-year noise. This is observational history for one postcode, not a
 * forecast and not a causal claim.
 */

export type TimingSignalKey = "daysOnMarket" | "discount" | "supply" | "sold" | "asking";

export const TIMING_SIGNAL_KEYS: TimingSignalKey[] = ["daysOnMarket", "discount", "supply", "sold", "asking"];

/** Signals that feed the buyer score. Prices are shown but excluded: their season is weak next to the noise. */
export const SCORED_SIGNALS: TimingSignalKey[] = ["daysOnMarket", "discount", "supply"];

/**
 * +1 when a higher deviation is better for a buyer, -1 when a lower one is.
 * The discount comes from statSeries as its size (positive DKK/m²), so a
 * higher value means a bigger discount, which favours the buyer.
 */
export const BUYER_DIRECTION: Record<TimingSignalKey, 1 | -1> = {
  daysOnMarket: 1,
  discount: 1,
  supply: 1,
  sold: -1,
  asking: -1,
};

/** Percent deviation for most series; DKK/m² for the discount. */
const SIGNAL_MODE: Record<TimingSignalKey, "percent" | "absolute"> = {
  daysOnMarket: "percent",
  discount: "absolute",
  supply: "percent",
  sold: "percent",
  asking: "percent",
};

export const MIN_YEARS = 10;
export const MIN_AGREEMENT = 0.7;
export const MIN_T = 2;

export interface MonthSignal {
  /** 1 = January. */
  month: number;
  /** Mean deviation from the moving-average trend. */
  mean: number;
  /** Standard deviation of the yearly deviations. */
  sd: number;
  years: number;
  /** Share of years whose deviation has the same sign as the mean (0-1). */
  agreement: number;
  tStat: number;
  reliable: boolean;
}

/** Deviation of every month from its centred 2x12 moving average. The first and last six months have none. */
export function detrend(points: MonthlyPoint[], mode: "percent" | "absolute"): MonthlyPoint[] {
  const out: MonthlyPoint[] = [];
  for (let i = 6; i < points.length - 6; i++) {
    let sum = 0;
    for (let j = i - 6; j <= i + 6; j++) {
      const weight = j === i - 6 || j === i + 6 ? 0.5 : 1;
      sum += points[j]!.value * weight;
    }
    const trend = sum / 12;
    const value = points[i]!.value;
    out.push({ month: points[i]!.month, value: mode === "percent" ? (value / trend - 1) * 100 : value - trend });
  }
  return out;
}

export function monthSignals(points: MonthlyPoint[], mode: "percent" | "absolute"): MonthSignal[] {
  const buckets = Array.from({ length: 12 }, () => [] as number[]);
  for (const point of detrend(points, mode)) buckets[Number(point.month.slice(5, 7)) - 1]!.push(point.value);
  return buckets.map((values, index) => {
    const years = values.length;
    const mean = years ? values.reduce((a, b) => a + b, 0) / years : 0;
    const variance = years > 1 ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / (years - 1) : 0;
    const sd = Math.sqrt(variance);
    const agreeing = values.filter((v) => (mean >= 0 ? v >= 0 : v < 0)).length;
    const agreement = years ? agreeing / years : 0;
    const tStat = sd > 0 && years > 1 ? mean / (sd / Math.sqrt(years)) : 0;
    return {
      month: index + 1,
      mean,
      sd,
      years,
      agreement,
      tStat,
      reliable: years >= MIN_YEARS && agreement >= MIN_AGREEMENT && Math.abs(tStat) >= MIN_T,
    };
  });
}

export interface TimingMonth {
  month: number;
  signals: Record<TimingSignalKey, MonthSignal>;
  /** Z-score of the month's buyer-favourable value across the twelve month means. Positive favours buyers. */
  favourability: Record<TimingSignalKey, number>;
  /** Mean of the days-on-market and discount favourability: how hard a buyer can negotiate. */
  leverage: number;
  /** Supply favourability: how much there is to choose from. */
  selection: number;
  /** Mean of all scored signals. */
  buyerScore: number;
}

function zScores(values: number[]): number[] {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return values.map((v) => (sd === 0 ? 0 : (v - mean) / sd));
}

export function buildTimingMonths(snapshot: ZipMarketSnapshot = zipMarketSnapshot): TimingMonth[] {
  const signals = Object.fromEntries(
    TIMING_SIGNAL_KEYS.map((key) => [key, monthSignals(statSeries(key as StatSeriesKey, snapshot), SIGNAL_MODE[key])]),
  ) as Record<TimingSignalKey, MonthSignal[]>;
  const favourability = Object.fromEntries(
    TIMING_SIGNAL_KEYS.map((key) => [key, zScores(signals[key].map((s) => s.mean * BUYER_DIRECTION[key]))]),
  ) as Record<TimingSignalKey, number[]>;
  return Array.from({ length: 12 }, (_, index) => {
    const fav = Object.fromEntries(TIMING_SIGNAL_KEYS.map((key) => [key, favourability[key][index]!])) as Record<TimingSignalKey, number>;
    const leverage = (fav.daysOnMarket + fav.discount) / 2;
    return {
      month: index + 1,
      signals: Object.fromEntries(TIMING_SIGNAL_KEYS.map((key) => [key, signals[key][index]!])) as Record<TimingSignalKey, MonthSignal>,
      favourability: fav,
      leverage,
      selection: fav.supply,
      buyerScore: SCORED_SIGNALS.reduce((sum, key) => sum + fav[key], 0) / SCORED_SIGNALS.length,
    };
  });
}

/** Months (1-12) whose value is at or above the threshold, in calendar order. */
export function monthsAtOrAbove(months: TimingMonth[], pick: (m: TimingMonth) => number, threshold: number): number[] {
  return months.filter((m) => pick(m) >= threshold).map((m) => m.month);
}

/**
 * Groups calendar months into runs, treating December and January as adjacent.
 * [12, 1, 2, 7] -> [[12, 1, 2], [7]].
 */
export function monthRuns(months: number[]): number[][] {
  const set = new Set(months);
  if (set.size === 0) return [];
  if (set.size === 12) return [Array.from({ length: 12 }, (_, i) => i + 1)];
  // Start each run at a month whose predecessor is absent, so wrap-around runs begin at their true start.
  const starts = [...set].filter((m) => !set.has(m === 1 ? 12 : m - 1)).sort((a, b) => a - b);
  const runs = starts.map((start) => {
    const run = [start];
    let next = start === 12 ? 1 : start + 1;
    while (set.has(next)) {
      run.push(next);
      next = next === 12 ? 1 : next + 1;
    }
    return run;
  });
  return runs.sort((a, b) => a[0]! - b[0]!);
}

export interface WaitingCost {
  /** Gap between the dearest and cheapest calendar month in the sold price, percent. */
  seasonalSpreadPercent: number;
  /** True when at least one month's sold-price season passes the reliability test. */
  seasonalPriceReliable: boolean;
  /** Sold price against the same month a year earlier, percent. */
  yearOverYearPercent: number | null;
  latestMonth: string;
}

export function waitingCost(months: TimingMonth[], snapshot: ZipMarketSnapshot = zipMarketSnapshot): WaitingCost {
  const sold = statSeries("sold", snapshot);
  const latest = sold[sold.length - 1]!;
  const previous = sold.find((p) => p.month === shiftMonth(latest.month, -12))?.value ?? null;
  const means = months.map((m) => m.signals.sold.mean);
  return {
    seasonalSpreadPercent: Math.max(...means) - Math.min(...means),
    seasonalPriceReliable: months.some((m) => m.signals.sold.reliable),
    yearOverYearPercent: percentChange(latest.value, previous),
    latestMonth: latest.month,
  };
}

export interface LatestVsTypical {
  key: TimingSignalKey;
  month: string;
  value: number;
  /** Mean of the same calendar month over the preceding years. */
  typical: number;
  /** Percent difference from typical; for the discount, DKK/m² of extra (positive) or smaller (negative) discount. */
  difference: number;
  mode: "percent" | "absolute";
  /** True when the difference is in the buyer's favour. */
  favoursBuyer: boolean;
  years: number;
}

/** Latest month against the same calendar month in each of the previous `years` years. */
export function latestVsTypical(key: TimingSignalKey, years = 5, snapshot: ZipMarketSnapshot = zipMarketSnapshot): LatestVsTypical | null {
  const points = statSeries(key as StatSeriesKey, snapshot);
  const latest = points[points.length - 1];
  if (!latest) return null;
  const earlier = Array.from({ length: years }, (_, i) => points.find((p) => p.month === shiftMonth(latest.month, -12 * (i + 1)))?.value).filter(
    (v): v is number => v !== undefined,
  );
  if (earlier.length < 3) return null;
  const typical = earlier.reduce((a, b) => a + b, 0) / earlier.length;
  const mode = SIGNAL_MODE[key];
  const raw = mode === "percent" ? (latest.value / typical - 1) * 100 : latest.value - typical;
  return {
    key,
    month: latest.month,
    value: latest.value,
    typical,
    difference: raw,
    mode,
    favoursBuyer: raw * BUYER_DIRECTION[key] > 0,
    years: earlier.length,
  };
}

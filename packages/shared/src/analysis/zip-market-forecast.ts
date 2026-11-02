import { monthlySeries, shiftMonth, zipMarketSnapshot, type MonthlyPoint, type ZipMarketSnapshot } from "./zip-market-stats.js";
import { monthSignals } from "./zip-market-timing.js";

/**
 * Twelve-month outlook for the sold price per m² in postcode 9000, from the monthly history alone.
 *
 * Method, in the order the choices were made:
 *
 * 1. Three simple candidates share one skeleton. The level is the last three months with the calendar
 *    season taken out, and the path is level x (1 + g)^(t/12) x season. They differ only in the growth `g`:
 *      flat      g = 0
 *      longrun   g = compound growth between the first and last 12 months seen so far
 *      momentum  g = half the latest 12-month change plus half the long-run growth
 * 2. Every candidate, and their plain average ("blend"), is tested the same way: rolling origin, expanding
 *    window. From each origin it forecasts the next 12 months using only data up to that month, and is scored
 *    against what happened. The blend is what is shown unless one single method beats it by more than
 *    SINGLE_METHOD_MARGIN in mean absolute error. The three are close on a short history, and picking a
 *    "winner" by a hair would only be noise. A rule fixed in advance, not tuned on the data.
 * 3. The range is not a model assumption. It is the 10th and 90th percentile of the errors that method
 *    actually made in the backtest, so it is as wide as the history says it should be.
 *
 * Limits that matter more than the decimals. One postcode. Origins one month apart overlap, so 12-month
 * results rest on roughly one independent window per year, about a dozen. The history holds one
 * low-rate boom (2020 to 2022) and one rate shock (2022 to 2023), and a forecast cannot know a third event.
 * No interest rate, income or construction data is used. This is a statistical extrapolation of one price
 * series, not a prediction of any home's price.
 */

export type SingleMethod = "flat" | "longrun" | "momentum";
export type ForecastMethod = SingleMethod | "blend";
export const SINGLE_METHODS: SingleMethod[] = ["flat", "longrun", "momentum"];
export const FORECAST_METHODS: ForecastMethod[] = [...SINGLE_METHODS, "blend"];
/** A single method replaces the blend only when its MAE is lower by at least this share of the blend's. */
export const SINGLE_METHOD_MARGIN = 0.1;

/** Years of history needed before a seasonal pattern is trusted at all. */
export const MIN_ORIGIN_MONTHS = 72;
export const HORIZON = 12;
/** Pulls a seasonal mean toward zero when it rests on few years: n / (n + SHRINK). */
const SEASON_SHRINK = 4;
const MOMENTUM_WEIGHT = 0.5;
const GROWTH_CAP = 0.15;
const LEVEL_MONTHS = 3;

export interface ForecastFit {
  method: SingleMethod;
  lastMonth: string;
  /** Seasonally adjusted level at the last month, DKK/m². */
  level: number;
  /** Annual growth used for the path. */
  growth: number;
  /** Seasonal factor per calendar month (index 0 = January), mean 1. */
  season: number[];
  longRunGrowth: number;
  latestYearChange: number;
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/** Multiplicative seasonal factors from detrended history, shrunk for few years and normalised to mean 1. */
export function seasonalFactors(points: MonthlyPoint[]): number[] {
  const raw = monthSignals(points, "percent").map((s) => (s.mean / 100) * (s.years / (s.years + SEASON_SHRINK)));
  const factors = raw.map((r) => 1 + r);
  const m = mean(factors);
  return factors.map((f) => f / m);
}

export function fitForecast(points: MonthlyPoint[], method: SingleMethod): ForecastFit {
  if (points.length < 24 + LEVEL_MONTHS) throw new Error("Not enough history to fit a forecast");
  const season = seasonalFactors(points);
  const adjusted = points.map((p) => p.value / season[Number(p.month.slice(5, 7)) - 1]!);
  const level = mean(adjusted.slice(-LEVEL_MONTHS));

  const n = points.length;
  const first = mean(points.slice(0, 12).map((p) => p.value));
  const last = mean(points.slice(-12).map((p) => p.value));
  const previous = mean(points.slice(-24, -12).map((p) => p.value));
  // The centres of the first and last 12 months are n - 12 months apart.
  const longRunGrowth = clamp((last / first) ** (12 / (n - 12)) - 1, GROWTH_CAP);
  const latestYearChange = clamp(last / previous - 1, GROWTH_CAP);

  const growth = method === "flat" ? 0 : method === "longrun" ? longRunGrowth : MOMENTUM_WEIGHT * latestYearChange + (1 - MOMENTUM_WEIGHT) * longRunGrowth;
  return { method, lastMonth: points[n - 1]!.month, level, growth, season, longRunGrowth, latestYearChange };
}

/** Forecast for months 1..horizon after the last observed month. */
export function projectPath(fit: ForecastFit, horizon = HORIZON): MonthlyPoint[] {
  return Array.from({ length: horizon }, (_, i) => {
    const h = i + 1;
    const month = shiftMonth(fit.lastMonth, h);
    // The level is a three-month mean centred one month before the last month, hence the extra month.
    const trend = fit.level * (1 + fit.growth) ** ((h + (LEVEL_MONTHS - 1) / 2) / 12);
    return { month, value: trend * fit.season[Number(month.slice(5, 7)) - 1]! };
  });
}

/** Path for any method. The blend is the month-by-month mean of the three single methods. */
export function pathFor(points: MonthlyPoint[], method: ForecastMethod): MonthlyPoint[] {
  if (method !== "blend") return projectPath(fitForecast(points, method));
  const paths = SINGLE_METHODS.map((m) => projectPath(fitForecast(points, m)));
  return paths[0]!.map((p, i) => ({ month: p.month, value: mean(paths.map((path) => path[i]!.value)) }));
}

export interface BacktestResult {
  method: ForecastMethod;
  origins: number;
  /** Rough count of non-overlapping 12-month windows behind the numbers. */
  windows: number;
  /** Mean absolute error of the next-12-month average level, as a share of the actual. */
  mae: number;
  /** Mean signed error (forecast over actual minus 1). Positive means it ran too high. */
  bias: number;
  /** Share of origins where the forecast got the direction of the 12-month change right. */
  directionHits: number;
  /** log(actual / forecast) of the next-12-month average, one per origin. */
  annualErrors: number[];
  /** log(actual / forecast) per month, indexed by horizon - 1. */
  monthlyErrors: number[][];
}

export function backtest(points: MonthlyPoint[], method: ForecastMethod): BacktestResult {
  const annualErrors: number[] = [];
  const monthlyErrors: number[][] = Array.from({ length: HORIZON }, () => []);
  const absolute: number[] = [];
  const signed: number[] = [];
  let hits = 0;
  for (let end = MIN_ORIGIN_MONTHS; end <= points.length - HORIZON; end++) {
    const history = points.slice(0, end);
    const actual = points.slice(end, end + HORIZON);
    const path = pathFor(history, method);
    const actualAvg = mean(actual.map((p) => p.value));
    const forecastAvg = mean(path.map((p) => p.value));
    const lastYearAvg = mean(history.slice(-12).map((p) => p.value));
    annualErrors.push(Math.log(actualAvg / forecastAvg));
    absolute.push(Math.abs(forecastAvg / actualAvg - 1));
    signed.push(forecastAvg / actualAvg - 1);
    if (Math.sign(forecastAvg - lastYearAvg) === Math.sign(actualAvg - lastYearAvg) || (forecastAvg === lastYearAvg && actualAvg === lastYearAvg)) hits++;
    path.forEach((p, i) => monthlyErrors[i]!.push(Math.log(actual[i]!.value / p.value)));
  }
  const origins = annualErrors.length;
  return {
    method,
    origins,
    windows: Math.floor(origins / 12),
    mae: mean(absolute),
    bias: mean(signed),
    directionHits: hits / origins,
    annualErrors,
    monthlyErrors,
  };
}

/** Linear-interpolated quantile, q in [0, 1]. */
export function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export interface ForecastPointOut {
  month: string;
  value: number;
  lo: number;
  hi: number;
}

export interface ForecastReport {
  lastMonth: string;
  historyMonths: number;
  historyFrom: string;
  /** Average of the last 12 observed months, DKK/m². */
  lastYearAverage: number;
  method: ForecastMethod;
  /** The three single-method fits at the last month, for showing their growth assumptions. */
  fits: ForecastFit[];
  /** Seasonally adjusted level now (DKK/m²), the starting point of every path. */
  currentLevel: number;
  path: ForecastPointOut[];
  /** Average of the forecast path, DKK/m², with the 10th to 90th percentile range from the backtest. */
  nextYearAverage: { value: number; lo: number; hi: number };
  /** Change of nextYearAverage against lastYearAverage, percent. */
  changePercent: { value: number; lo: number; hi: number };
  /** Change of nextYearAverage against currentLevel, percent: what is still to come, not already in the price. */
  changeFromLevelPercent: { value: number; lo: number; hi: number };
  backtests: BacktestResult[];
  /** Best single method by MAE, shown for comparison even when the blend is used. */
  bestSingle: SingleMethod;
  /** Cheapest and dearest forecast months, to relate the path to the seasonal buying advice. */
  cheapestMonth: string;
  dearestMonth: string;
}

export function buildForecast(snapshot: ZipMarketSnapshot = zipMarketSnapshot): ForecastReport {
  const points = monthlySeries("sold_per_area_price", snapshot);
  const backtests = FORECAST_METHODS.map((method) => backtest(points, method));
  const blendRun = backtests.find((b) => b.method === "blend")!;
  const bestSingleRun = backtests.filter((b) => b.method !== "blend").reduce((top, b) => (b.mae < top.mae ? b : top));
  const run = bestSingleRun.mae < blendRun.mae * (1 - SINGLE_METHOD_MARGIN) ? bestSingleRun : blendRun;
  const method = run.method;
  const fits = SINGLE_METHODS.map((m) => fitForecast(points, m));
  const path = pathFor(points, method);

  const monthlyBands = run.monthlyErrors.map((errors) => [quantile(errors, 0.1), quantile(errors, 0.9)] as const);
  const out: ForecastPointOut[] = path.map((p, i) => ({
    month: p.month,
    value: p.value,
    lo: p.value * Math.exp(monthlyBands[i]![0]),
    hi: p.value * Math.exp(monthlyBands[i]![1]),
  }));

  const lastYearAverage = mean(points.slice(-12).map((p) => p.value));
  const currentLevel = fits[0]!.level;
  const forecastAvg = mean(path.map((p) => p.value));
  const annualLo = forecastAvg * Math.exp(quantile(run.annualErrors, 0.1));
  const annualHi = forecastAvg * Math.exp(quantile(run.annualErrors, 0.9));
  const against = (base: number) => (value: number) => (value / base - 1) * 100;
  const vsYear = against(lastYearAverage);
  const vsLevel = against(currentLevel);

  const sorted = [...path].sort((a, b) => a.value - b.value);
  return {
    lastMonth: points[points.length - 1]!.month,
    historyMonths: points.length,
    historyFrom: points[0]!.month,
    lastYearAverage,
    method,
    fits,
    currentLevel,
    path: out,
    nextYearAverage: { value: forecastAvg, lo: annualLo, hi: annualHi },
    changePercent: { value: vsYear(forecastAvg), lo: vsYear(annualLo), hi: vsYear(annualHi) },
    changeFromLevelPercent: { value: vsLevel(forecastAvg), lo: vsLevel(annualLo), hi: vsLevel(annualHi) },
    backtests,
    bestSingle: bestSingleRun.method as SingleMethod,
    cheapestMonth: sorted[0]!.month,
    dearestMonth: sorted[sorted.length - 1]!.month,
  };
}

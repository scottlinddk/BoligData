import {
  monthlySeries,
  pearsonCorrelation,
  percentChange,
  shiftMonth,
  yearlyAverages,
  zipMarketSnapshot,
  type MonthlyPoint,
  type ZipMarketMetric,
  type ZipMarketSnapshot,
} from "./zip-market-stats.js";

/**
 * How the postcode series move over time and relate to each other. Built on the
 * snapshot helpers in `zip-market-stats`. Everything here is descriptive: the
 * data is one postcode, observational, and has no transaction counts.
 *
 * Relationships are measured on 12-month changes, not on levels. Levels share a
 * long upward trend, which inflates correlations (see the note in the PR that
 * added the snapshot). Overlapping 12-month windows are still autocorrelated,
 * so the reported `n` overstates the number of independent observations.
 */

export const STAT_SERIES_KEYS = ["asking", "sold", "supply", "daysOnMarket", "discount"] as const;
export type StatSeriesKey = (typeof STAT_SERIES_KEYS)[number];

export const STAT_SERIES: Record<StatSeriesKey, ZipMarketMetric> = {
  asking: "per_area_price",
  sold: "sold_per_area_price",
  supply: "amount_for_sale",
  daysOnMarket: "sold_time_on_market",
  discount: "sold_per_area_price_change",
};

/** Level series are compared in percent; days and the discount in absolute units. */
const PERCENT_CHANGE_SERIES: Record<StatSeriesKey, boolean> = {
  asking: true,
  sold: true,
  supply: true,
  daysOnMarket: false,
  discount: false,
};

/**
 * Monthly points for one of the five series. The snapshot stores the discount as
 * a negative number; here it is the size of the discount (positive), so every
 * series reads "up means more" and change and correlation signs are intuitive.
 */
export function statSeries(key: StatSeriesKey, snapshot: ZipMarketSnapshot = zipMarketSnapshot): MonthlyPoint[] {
  const points = monthlySeries(STAT_SERIES[key], snapshot);
  return key === "discount" ? points.map((point) => ({ month: point.month, value: -point.value })) : points;
}

/** Change against the same month one year earlier: percent when `percent`, otherwise the absolute difference. */
export function yearOverYear(points: MonthlyPoint[], percent: boolean): MonthlyPoint[] {
  const byMonth = new Map(points.map((point) => [point.month, point.value]));
  return points.flatMap((point) => {
    const previous = byMonth.get(shiftMonth(point.month, -12));
    if (previous === undefined) return [];
    const value = percent ? percentChange(point.value, previous) : point.value - previous;
    return value === null ? [] : [{ month: point.month, value }];
  });
}

/** 12-month change for one of the five named series. */
export function seriesYearOverYear(key: StatSeriesKey, snapshot: ZipMarketSnapshot = zipMarketSnapshot): MonthlyPoint[] {
  return yearOverYear(statSeries(key, snapshot), PERCENT_CHANGE_SERIES[key]);
}

export interface LagPoint {
  lag: number;
  r: number | null;
  n: number;
}

/**
 * Pearson correlation between `leader` in month t and `follower` in month t + lag.
 * A positive lag asks "does the follower move `lag` months after the leader?".
 * `from`/`to` bound the leader months, so stability can be checked per period.
 */
export function laggedCorrelation(
  leader: MonthlyPoint[],
  follower: MonthlyPoint[],
  lag: number,
  window: { from?: string; to?: string } = {},
): LagPoint {
  const followerByMonth = new Map(follower.map((point) => [point.month, point.value]));
  const a: MonthlyPoint[] = [];
  const b: MonthlyPoint[] = [];
  for (const point of leader) {
    if (window.from && point.month < window.from) continue;
    if (window.to && point.month > window.to) continue;
    const other = followerByMonth.get(shiftMonth(point.month, lag));
    if (other === undefined) continue;
    a.push(point);
    b.push({ month: point.month, value: other });
  }
  const result = pearsonCorrelation(a, b);
  return { lag, r: result?.r ?? null, n: a.length };
}

export function leadLagProfile(leader: MonthlyPoint[], follower: MonthlyPoint[], lags: number[]): LagPoint[] {
  return lags.map((lag) => laggedCorrelation(leader, follower, lag));
}

/** The lag with the strongest correlation, in either direction. */
export function strongestLag(profile: LagPoint[]): LagPoint | null {
  let best: LagPoint | null = null;
  for (const point of profile) {
    if (point.r === null) continue;
    if (best === null || Math.abs(point.r) > Math.abs(best.r!)) best = point;
  }
  return best;
}

/** Plain-language strength bucket for a correlation coefficient. */
export type CorrelationStrength = "negligible" | "weak" | "moderate" | "strong";

export function correlationStrength(r: number | null): CorrelationStrength {
  const size = Math.abs(r ?? 0);
  if (size < 0.2) return "negligible";
  if (size < 0.4) return "weak";
  if (size < 0.6) return "moderate";
  return "strong";
}

/** Share of months (0-100) with a value below `value`, counting ties as half. */
export function percentileRank(points: MonthlyPoint[], value: number): number {
  if (points.length === 0) return 0;
  let below = 0;
  let equal = 0;
  for (const point of points) {
    if (point.value < value) below++;
    else if (point.value === value) equal++;
  }
  return ((below + equal / 2) / points.length) * 100;
}

export interface SeriesExtreme {
  value: number;
  month: string;
}

export function seriesExtremes(points: MonthlyPoint[]): { min: SeriesExtreme; max: SeriesExtreme } {
  let min = points[0]!;
  let max = points[0]!;
  for (const point of points) {
    if (point.value < min.value) min = point;
    if (point.value > max.value) max = point;
  }
  return { min: { value: min.value, month: min.month }, max: { value: max.value, month: max.month } };
}

/** Latest month strictly before `before` whose value is at or above `value`; null when there is none. */
export function lastMonthAtOrAbove(points: MonthlyPoint[], value: number, before: string): string | null {
  let found: string | null = null;
  for (const point of points) {
    if (point.month < before && point.value >= value && (found === null || point.month > found)) found = point.month;
  }
  return found;
}

/** The month-over-month change with the largest absolute size inside the window, in percent. */
export function largestMonthOverMonthMove(
  points: MonthlyPoint[],
  window: { from?: string; to?: string } = {},
): { month: string; changePercent: number } | null {
  let best: { month: string; changePercent: number } | null = null;
  for (let i = 1; i < points.length; i++) {
    const point = points[i]!;
    if ((window.from && point.month < window.from) || (window.to && point.month > window.to)) continue;
    const change = percentChange(point.value, points[i - 1]!.value);
    if (change !== null && (best === null || Math.abs(change) > Math.abs(best.changePercent))) best = { month: point.month, changePercent: change };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Market phases
// ---------------------------------------------------------------------------

export const MARKET_PHASE_IDS = [
  "soft-bottom",
  "recovery",
  "plateau",
  "covid-dip",
  "squeeze-boom",
  "cooling",
  "slow-high-supply",
  "price-rebound",
] as const;
export type MarketPhaseId = (typeof MARKET_PHASE_IDS)[number];

export interface MarketPhase {
  id: MarketPhaseId;
  /** First and last month of the phase, inclusive, "YYYY-MM". */
  from: string;
  to: string;
}

/**
 * Phase boundaries are chosen from the data: each turning point is a local
 * extreme in the sold or asking price series (for example the sold price low
 * in 2013-09 and the asking price peak in 2022-08). They describe, they do not
 * claim a cause.
 */
export const MARKET_PHASES: MarketPhase[] = [
  { id: "soft-bottom", from: "2011-01", to: "2013-09" },
  { id: "recovery", from: "2013-10", to: "2016-12" },
  { id: "plateau", from: "2017-01", to: "2019-12" },
  { id: "covid-dip", from: "2020-01", to: "2020-12" },
  { id: "squeeze-boom", from: "2021-01", to: "2022-08" },
  { id: "cooling", from: "2022-09", to: "2023-12" },
  { id: "slow-high-supply", from: "2024-01", to: "2025-03" },
  { id: "price-rebound", from: "2025-04", to: "2026-09" },
];

export interface PhaseMetricSummary {
  start: number;
  end: number;
  /** Start-to-end change in percent; null when the start is zero. */
  changePercent: number | null;
  average: number;
  min: SeriesExtreme;
  max: SeriesExtreme;
}

export interface PhaseSummary {
  phase: MarketPhase;
  months: number;
  metrics: Record<StatSeriesKey, PhaseMetricSummary>;
}

export function summarizePhase(phase: MarketPhase, snapshot: ZipMarketSnapshot = zipMarketSnapshot): PhaseSummary {
  const metrics = {} as Record<StatSeriesKey, PhaseMetricSummary>;
  let months = 0;
  for (const key of STAT_SERIES_KEYS) {
    const points = statSeries(key, snapshot).filter((point) => point.month >= phase.from && point.month <= phase.to);
    if (points.length === 0) throw new Error(`No ${key} data in phase ${phase.id}`);
    months = points.length;
    const start = points[0]!.value;
    const end = points[points.length - 1]!.value;
    metrics[key] = {
      start,
      end,
      changePercent: percentChange(end, start),
      average: points.reduce((sum, point) => sum + point.value, 0) / points.length,
      ...seriesExtremes(points),
    };
  }
  return { phase, months, metrics };
}

export function summarizePhases(snapshot: ZipMarketSnapshot = zipMarketSnapshot): PhaseSummary[] {
  return MARKET_PHASES.map((phase) => summarizePhase(phase, snapshot));
}

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

export interface PairCorrelation {
  a: StatSeriesKey;
  b: StatSeriesKey;
  r: number | null;
  n: number;
}

export interface LeadLagResult {
  leader: StatSeriesKey;
  follower: StatSeriesKey;
  profile: LagPoint[];
  sameMonth: LagPoint;
  best: LagPoint | null;
  /** Correlation at the best lag in the first and second half of the 12-month-change history. */
  halves: { first: number | null; second: number | null } | null;
}

export const LEAD_LAG_PAIRS: [StatSeriesKey, StatSeriesKey][] = [
  ["asking", "sold"],
  ["supply", "asking"],
  ["supply", "sold"],
  ["supply", "daysOnMarket"],
  ["supply", "discount"],
  ["daysOnMarket", "sold"],
  ["discount", "sold"],
];

/** Lags in months, negative meaning the "follower" actually moved first. */
export const LAG_RANGE = Array.from({ length: 19 }, (_, i) => i - 9);

export interface ZipMarketRelationships {
  /** 12-month changes, same month, every pair of series. */
  changeCorrelations: PairCorrelation[];
  /** Calendar-year average changes (full years only). Few points, so read as a cross-check. */
  annualCorrelations: PairCorrelation[];
  leadLag: LeadLagResult[];
  /** Sample standard deviation of month-over-month percent changes. */
  monthlyVolatility: { asking: number | null; sold: number | null };
}

function pairs(): [StatSeriesKey, StatSeriesKey][] {
  const result: [StatSeriesKey, StatSeriesKey][] = [];
  STAT_SERIES_KEYS.forEach((a, i) => STAT_SERIES_KEYS.slice(i + 1).forEach((b) => result.push([a, b])));
  return result;
}

/** Year-to-year change of full-year averages, keyed by "YYYY-01" so the month-based helpers apply. */
function annualChanges(key: StatSeriesKey, snapshot: ZipMarketSnapshot): MonthlyPoint[] {
  const full = yearlyAverages(statSeries(key, snapshot)).filter((year) => year.months === 12);
  const changes: MonthlyPoint[] = [];
  for (let i = 1; i < full.length; i++) {
    const previous = full[i - 1]!;
    const current = full[i]!;
    if (current.year !== previous.year + 1) continue;
    const value = PERCENT_CHANGE_SERIES[key] ? percentChange(current.average, previous.average) : current.average - previous.average;
    if (value !== null) changes.push({ month: `${current.year}-01`, value });
  }
  return changes;
}

function monthOverMonthDeviation(points: MonthlyPoint[]): number | null {
  const changes: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const change = percentChange(points[i]!.value, points[i - 1]!.value);
    if (change !== null) changes.push(change);
  }
  if (changes.length < 2) return null;
  const mean = changes.reduce((sum, value) => sum + value, 0) / changes.length;
  return Math.sqrt(changes.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (changes.length - 1));
}

export function analyzeRelationships(snapshot: ZipMarketSnapshot = zipMarketSnapshot): ZipMarketRelationships {
  const yoy = Object.fromEntries(STAT_SERIES_KEYS.map((key) => [key, seriesYearOverYear(key, snapshot)])) as Record<StatSeriesKey, MonthlyPoint[]>;
  const annual = Object.fromEntries(STAT_SERIES_KEYS.map((key) => [key, annualChanges(key, snapshot)])) as Record<StatSeriesKey, MonthlyPoint[]>;

  const correlate = (source: Record<StatSeriesKey, MonthlyPoint[]>): PairCorrelation[] =>
    pairs().map(([a, b]) => {
      const result = pearsonCorrelation(source[a], source[b]);
      return { a, b, r: result?.r ?? null, n: result?.n ?? 0 };
    });

  const firstMonth = yoy.asking[0]!.month;
  const lastMonth = yoy.asking[yoy.asking.length - 1]!.month;
  const midpoint = shiftMonth(firstMonth, Math.floor((monthIndexDistance(firstMonth, lastMonth) + 1) / 2));

  const leadLag = LEAD_LAG_PAIRS.map(([leader, follower]): LeadLagResult => {
    const profile = leadLagProfile(yoy[leader], yoy[follower], LAG_RANGE);
    const best = strongestLag(profile);
    return {
      leader,
      follower,
      profile,
      sameMonth: profile.find((point) => point.lag === 0)!,
      best,
      halves: best
        ? {
            first: laggedCorrelation(yoy[leader], yoy[follower], best.lag, { to: shiftMonth(midpoint, -1) }).r,
            second: laggedCorrelation(yoy[leader], yoy[follower], best.lag, { from: midpoint }).r,
          }
        : null,
    };
  });

  return {
    changeCorrelations: correlate(yoy),
    annualCorrelations: correlate(annual),
    leadLag,
    monthlyVolatility: {
      asking: monthOverMonthDeviation(statSeries("asking", snapshot)),
      sold: monthOverMonthDeviation(statSeries("sold", snapshot)),
    },
  };
}

function monthIndexDistance(from: string, to: string): number {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
}

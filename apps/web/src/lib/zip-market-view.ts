import {
  STAT_SERIES_KEYS,
  percentileRank,
  seriesExtremes,
  statSeries,
  type SeriesExtreme,
  type StatSeriesKey,
} from "@shared/analysis/zip-market-relationships";
import {
  percentChange,
  seasonalDeviation,
  shiftMonth,
  yearlyAverages,
  zipMarketSnapshot,
  type MonthlyPoint,
} from "@shared/analysis/zip-market-stats";

/** View models for the /stats page. Pure, so the numbers on screen are testable without rendering. */

const TREND_MONTHS = 60;

export interface KpiModel {
  key: StatSeriesKey;
  value: number;
  previousYear: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
  /** Share of all months (0-100) with a lower value than the latest month. */
  percentile: number;
  min: SeriesExtreme;
  max: SeriesExtreme;
  trend: MonthlyPoint[];
}

export interface StatsView {
  latestMonth: string;
  firstMonth: string;
  monthCount: number;
  months: string[];
  series: Record<StatSeriesKey, MonthlyPoint[]>;
  kpis: KpiModel[];
}

export function buildStatsView(): StatsView {
  const series = Object.fromEntries(STAT_SERIES_KEYS.map((key) => [key, statSeries(key)])) as Record<StatSeriesKey, MonthlyPoint[]>;
  const months = series.sold.map((point) => point.month);
  const latestMonth = zipMarketSnapshot.period.to;
  const kpis = STAT_SERIES_KEYS.map((key): KpiModel => {
    const points = series[key];
    const latest = points[points.length - 1]!;
    const previous = points.find((point) => point.month === shiftMonth(latest.month, -12))?.value ?? null;
    return {
      key,
      value: latest.value,
      previousYear: previous,
      absoluteChange: previous === null ? null : latest.value - previous,
      percentChange: percentChange(latest.value, previous),
      percentile: percentileRank(points, latest.value),
      ...seriesExtremes(points),
      trend: points.slice(-TREND_MONTHS),
    };
  });
  return { latestMonth, firstMonth: zipMarketSnapshot.period.from, monthCount: months.length, months, series, kpis };
}

export interface YearlyRow {
  year: number;
  months: number;
  /** True for a calendar year with fewer than twelve months of data. */
  partial: boolean;
  values: Record<StatSeriesKey, number>;
  /** Sold price against the previous year's average; null for the first year and when either year is partial. */
  soldChangePercent: number | null;
}

export function buildYearlyRows(): YearlyRow[] {
  const perSeries = Object.fromEntries(STAT_SERIES_KEYS.map((key) => [key, yearlyAverages(statSeries(key))])) as Record<StatSeriesKey, ReturnType<typeof yearlyAverages>>;
  const sold = perSeries.sold;
  return sold.map((row, index) => {
    const previous = sold[index - 1];
    const comparable = previous !== undefined && previous.months === 12 && row.months === 12;
    return {
      year: row.year,
      months: row.months,
      partial: row.months < 12,
      values: Object.fromEntries(STAT_SERIES_KEYS.map((key) => [key, perSeries[key][index]!.average])) as Record<StatSeriesKey, number>,
      soldChangePercent: comparable ? percentChange(row.average, previous.average) : null,
    };
  });
}

export interface SeasonalityRow {
  key: StatSeriesKey;
  /** January first. Percent deviation from the year's own average, over full years only. */
  deviations: number[];
}

export function buildSeasonality(): SeasonalityRow[] {
  const keys: StatSeriesKey[] = ["sold", "daysOnMarket", "supply"];
  return keys.map((key) => ({ key, deviations: seasonalDeviation(statSeries(key)).map((row) => row.deviationPercent) }));
}

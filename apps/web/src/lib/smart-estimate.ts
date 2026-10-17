import { compareAskingToValuation, type ValuationBand } from "@shared/analysis/valuation-comparison";
import type { SparHistoryPoint, SparListingEstimate } from "@shared/types/spar";

/**
 * Presentation logic for the smart estimate. It adds no model: every number comes from the SPAR
 * estimate (public valuation x smoothed market level) or the asking-vs-valuation comparison.
 * Factors describe what the estimate rests on, not what causes a price, so nothing here claims
 * anything about condition, location or renovations.
 */

export type EstimateFactor =
  | { kind: "valuation"; valueDkk: number; year: number }
  | { kind: "market_level"; ratio: number; period: string; nSales: number; isUnit: boolean }
  | { kind: "trend"; months: number; change: number }
  | { kind: "asking_vs_estimate"; askingPrice: number; ratio: number; withinInterval: boolean }
  | { kind: "asking_vs_valuation"; percent: number; band: ValuationBand; tolerancePercent: number }
  | { kind: "stale"; period: string; ageMonths: number }
  | { kind: "preliminary" };

const shiftPeriod = (period: string, months: number): string => {
  const [year, month] = period.split("-").map(Number) as [number, number];
  const index = year * 12 + (month - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
};

/** Relative change of the fair-price level over `months`, or null when the history does not reach back that far. */
export function levelTrend(history: SparHistoryPoint[], months = 12): { months: number; change: number } | null {
  const last = history[history.length - 1];
  if (!last) return null;
  const earlier = history.find(point => point.period === shiftPeriod(last.period, -months));
  if (!earlier || !(earlier.estimate > 0)) return null;
  return { months, change: last.estimate / earlier.estimate - 1 };
}

/** The ordered list of things the estimate rests on, with warnings last. Empty when there is no estimate. */
export function estimateFactors(result: SparListingEstimate, propertyType?: string | null): EstimateFactor[] {
  if (result.status !== "available" || !result.valuation || !result.index || !result.fairPrice) return [];
  const factors: EstimateFactor[] = [
    { kind: "valuation", valueDkk: result.valuation.valueDkk, year: result.valuation.year },
    { kind: "market_level", ratio: result.index.ratio, period: result.index.period, nSales: result.index.nSales, isUnit: result.isUnit },
  ];
  const trend = levelTrend(result.history);
  if (trend) factors.push({ kind: "trend", ...trend });
  if (result.askingPrice !== null && result.askingVsFair !== null) {
    factors.push({
      kind: "asking_vs_estimate", askingPrice: result.askingPrice, ratio: result.askingVsFair,
      withinInterval: result.askingPrice >= result.fairPrice.lo80 && result.askingPrice <= result.fairPrice.hi80,
    });
    // The valuation comparison is a weak reference for apartments, so the helper withholds its verdict there.
    const comparison = compareAskingToValuation({
      askingPrice: result.askingPrice, ejendomsvaerdi: result.valuation.valueDkk, kind: null, year: result.valuation.year,
      propertyType: result.isUnit ? "lejlighed" : propertyType,
    });
    if (comparison.status === "available") {
      factors.push({ kind: "asking_vs_valuation", percent: comparison.percent, band: comparison.band, tolerancePercent: Math.round(comparison.toleranceRatio * 100) });
    }
  }
  if (result.index.stale) factors.push({ kind: "stale", period: result.index.period, ageMonths: result.index.ageMonths });
  if (result.index.preliminary) factors.push({ kind: "preliminary" });
  return factors;
}

export interface RangeLayout {
  /** Percent positions along the bar, 0 to 100. */
  lo80: number;
  hi80: number;
  estimate: number;
  /** Null without an asking price. Clamped into the bar; `outside` says when it was clamped. */
  asking: number | null;
  outside: "below" | "above" | null;
}

/** Bar domain is the 95 % interval, widened to include the asking price so the marker never leaves it unexplained. */
export function rangeLayout(fair: NonNullable<SparListingEstimate["fairPrice"]>, askingPrice: number | null): RangeLayout {
  const min = fair.lo95, max = fair.hi95;
  const pos = (value: number) => ((value - min) / (max - min)) * 100;
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  const asking = askingPrice !== null && askingPrice > 0 ? pos(askingPrice) : null;
  return {
    lo80: clamp(pos(fair.lo80)), hi80: clamp(pos(fair.hi80)), estimate: clamp(pos(fair.estimate)),
    asking: asking === null ? null : clamp(asking),
    outside: asking === null ? null : asking < 0 ? "below" : asking > 100 ? "above" : null,
  };
}

/** "2,8 mio." style label for chart axes. */
export function formatMillions(value: number, language: "da" | "en"): string {
  const digits = value >= 10_000_000 ? 0 : 1;
  const text = (value / 1_000_000).toLocaleString(language === "da" ? "da-DK" : "en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${text} ${language === "da" ? "mio." : "m"}`;
}

/** Month label like "mar. 2025" from "2025-03". */
export function formatPeriod(period: string, language: "da" | "en"): string {
  const [year, month] = period.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(language === "da" ? "da-DK" : "en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** "+10 %" / "−3 %" with a real minus sign, the way the rest of the estimate UI shows differences. */
export function formatSignedPercent(fraction: number, language: "da" | "en", digits = 0): string {
  const value = Math.abs(fraction * 100).toLocaleString(language === "da" ? "da-DK" : "en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${fraction >= 0 ? "+" : "−"}${value} %`;
}

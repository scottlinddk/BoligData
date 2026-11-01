import {
  buildTimingMonths,
  latestVsTypical,
  monthRuns,
  monthsAtOrAbove,
  waitingCost,
  type LatestVsTypical,
  type TimingMonth,
  type WaitingCost,
} from "@shared/analysis/zip-market-timing";

/** View model for the "best time to buy" section of /stats. Pure, so the verdicts are testable without rendering. */

/** A month counts as favourable on an axis when its z-score is at least this. */
export const FAVOURABLE_Z = 0.5;

export type Level = "high" | "middle" | "low";

export function levelOf(z: number): Level {
  return z >= FAVOURABLE_Z ? "high" : z <= -FAVOURABLE_Z ? "low" : "middle";
}

/** What a calendar month means for a buyer, in one word. */
export type MonthCategory = "negotiate" | "balance" | "choice" | "fast" | "neutral";

export function monthCategory(month: TimingMonth): MonthCategory {
  const leverage = levelOf(month.leverage);
  const selection = levelOf(month.selection);
  if (leverage === "high") return month.selection >= 0 ? "balance" : "negotiate";
  if (selection === "high") return "choice";
  if (leverage === "low") return "fast";
  return "neutral";
}

export interface TimingView {
  months: TimingMonth[];
  categories: MonthCategory[];
  /** Months with strong negotiating leverage, grouped into runs (December and January are adjacent). */
  leverageRuns: number[][];
  /** Months with the widest choice of homes. */
  selectionRuns: number[][];
  /** Months where the buyer has least leverage, i.e. the seller's best window. */
  sellerRuns: number[][];
  /** Leverage months whose days-on-market signal is also statistically reliable. */
  solidLeverageMonths: number[];
  /** Leverage months where the evidence only points the same way. */
  tentativeLeverageMonths: number[];
  /** Months with good leverage and at least average choice. */
  balancedMonths: number[];
  /** Single best month by leverage. */
  bestLeverageMonth: number;
  waiting: WaitingCost;
  latest: LatestVsTypical[];
}

export function buildTimingView(): TimingView {
  const months = buildTimingMonths();
  const leverageMonths = monthsAtOrAbove(months, (m) => m.leverage, FAVOURABLE_Z);
  const selectionMonths = monthsAtOrAbove(months, (m) => m.selection, FAVOURABLE_Z);
  const solid = leverageMonths.filter((n) => months[n - 1]!.signals.daysOnMarket.reliable);
  const best = [...months].sort((a, b) => b.leverage - a.leverage)[0]!;
  return {
    months,
    categories: months.map(monthCategory),
    leverageRuns: monthRuns(leverageMonths),
    selectionRuns: monthRuns(selectionMonths),
    sellerRuns: monthRuns(monthsAtOrAbove(months, (m) => -m.leverage, FAVOURABLE_Z)),
    solidLeverageMonths: solid,
    tentativeLeverageMonths: leverageMonths.filter((n) => !solid.includes(n)),
    balancedMonths: leverageMonths.filter((n) => months[n - 1]!.selection >= 0),
    bestLeverageMonth: best.month,
    waiting: waitingCost(months),
    latest: (["daysOnMarket", "supply", "discount"] as const).map((key) => latestVsTypical(key)).filter((x): x is LatestVsTypical => x !== null),
  };
}

/** "november til marts" / "Nov to Mar" from a run of calendar months. */
export function describeRun(run: number[], names: string[], joiner: string): string {
  if (run.length === 1) return names[run[0]! - 1]!;
  return `${names[run[0]! - 1]} ${joiner} ${names[run[run.length - 1]! - 1]}`;
}

export function describeRuns(runs: number[][], names: string[], joiner: string, and: string): string {
  const parts = runs.map((run) => describeRun(run, names, joiner));
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} ${and} ${parts[parts.length - 1]}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

import { hedonicResults, type HedonicResults, type HedonicSegment } from "@shared/analysis/hedonic-results";
import { buildForecast, type ForecastReport } from "@shared/analysis/zip-market-forecast";

/**
 * Figures from the hedonic analysis and the forecast that bear on WHEN and HOW to buy, for the
 * "best time to buy" section. Pure, so each claim on the page is a tested number rather than prose.
 */

export interface SaleTypeFinding {
  segment: HedonicSegment;
  /** Median price per m² of normal (arm's-length) sales against the monthly index, 1 = at the index. */
  normalRelative: number;
  normalN: number;
  /** Same for family sales. Null with fewer than FAMILY_MIN_N sales, too few to say. */
  familyRelative: number | null;
  familyN: number;
}

export interface ValuationFinding {
  /** Median sale price divided by the public valuation known at the sale. */
  medianRatio: number;
  p10: number;
  p90: number;
  /** Sales with a valuation known at the time. */
  n: number;
  /** Share of all clean house sales that have one. */
  coverage: number;
}

export interface TimingFindings {
  saleTypes: SaleTypeFinding[];
  /** Houses only: an apartment's valuation covers 16% of its sales and is not comparable. */
  houseValuation: ValuationFinding | null;
  /** Segments where a plain median of recent comparable sales was at least as good as any model. */
  baselineWins: HedonicSegment[];
  cleanSales: number;
  forecast: ForecastReport;
}

export const FAMILY_MIN_N = 10;

export function buildTimingFindings(results: HedonicResults = hedonicResults, forecast: ForecastReport = buildForecast()): TimingFindings {
  const diag = results.dev.audit.sale_type_diagnostic;
  const saleTypes: SaleTypeFinding[] = (["house", "apartment"] as const).flatMap((segment) => {
    const normal = diag.find((d) => d.segment === segment && d.sale_type === "normal");
    const family = diag.find((d) => d.segment === segment && d.sale_type === "family");
    if (!normal) return [];
    return [
      {
        segment,
        normalRelative: normal.median_rel_to_index,
        normalN: normal.n,
        familyRelative: family && family.n >= FAMILY_MIN_N ? family.median_rel_to_index : null,
        familyN: family?.n ?? 0,
      },
    ];
  });

  const vur = results.dev.audit.vur.house as (typeof results.dev.audit.vur)[string] & { price_to_valuation_p10_p90?: [number, number] };
  const houseValuation: ValuationFinding | null =
    vur && vur.price_to_valuation_median !== null && vur.price_to_valuation_p10_p90 && vur.with_asof_valuation >= 30
      ? { medianRatio: vur.price_to_valuation_median, p10: vur.price_to_valuation_p10_p90[0], p90: vur.price_to_valuation_p10_p90[1], n: vur.with_asof_valuation, coverage: vur.share }
      : null;

  const baselineWins = (Object.entries(results.dev.decision) as [HedonicSegment, { recommended: string | null; best_baseline: string }][])
    .filter(([, d]) => d.recommended !== null && d.recommended === d.best_baseline)
    .map(([segment]) => segment);

  const clean = results.dev.audit.steps[results.dev.audit.steps.length - 1];
  return { saleTypes, houseValuation, baselineWins, cleanSales: clean?.remaining ?? 0, forecast };
}

import resultsJson from "../data/hedonic-results.json" with { type: "json" };

/**
 * Resultater fra den offline hedoniske pipeline (analysis/hedonic). Filen er GENERERET af
 * `python -m boligpris report` og må ikke redigeres i hånden. Her beskrives kun de felter, siden bruger.
 */

export type HedonicSegment = "house" | "apartment";
export type HedonicMethod = "a1" | "a2" | "b" | "ridge" | "gbm";

export interface MethodMetrics {
  n: number;
  n_total: number;
  mdape: number | null;
  bias: number | null;
  p90_ape: number | null;
  coverage: number | null;
  coverage_ci90?: [number, number] | null;
  median_rel_width: number | null;
  n_interval: number;
  indicative: boolean;
}

export interface SegmentMethodRow extends MethodMetrics {
  segment: HedonicSegment;
  method: HedonicMethod;
}

export interface AuditStep {
  step: string;
  removed: number;
  remaining: number;
  dropped_by_type?: Record<string, number>;
  ambiguous_same_day_diff_price?: number;
  near_duplicates?: number;
}

export interface YearlyRow {
  year: number;
  n: number;
  unique_properties: number;
  median_price: number | null;
  median_ppsqm: number | null;
  median_area: number | null;
  median_building_year: number | null;
  share_terraced: number | null;
  relative_to_index_median: number;
}

export interface PairedRow {
  segment: HedonicSegment;
  challenger: HedonicMethod;
  baseline: HedonicMethod;
  n: number;
  diff: number | null;
  lo: number | null;
  hi: number | null;
  relative_change: number | null;
}

export interface ScoringSegment {
  method: HedonicMethod;
  listings: number;
  assessable: number;
  with_point_estimate: number;
  not_assessable: Record<string, number>;
  low_confidence_year_missing: number;
  ratio_quantiles: Record<string, number> | null;
  position_shares: Record<string, number> | null;
  median_rel_halfwidth: number | null;
  model_spread_median: number | null;
  n_calibration: number;
  calibration_window_months: number | null;
  n_train: number;
  median_comparables: number;
  median_asking_over_estimate_by_method: Record<string, number>;
}

export interface HedonicResults {
  schema_version: number;
  dev: {
    audit: {
      steps: AuditStep[];
      sale_type_diagnostic: { segment: HedonicSegment; sale_type: string; n: number; median_rel_to_index: number }[];
      flags: { ppsqm_outlier: number; area_drift: number; any: number; robust_z_threshold: number };
      missing: Record<string, { n: number; rooms_missing: number; year_missing: number; vur_missing: number }>;
      area_drift: { n_with_area_at_sale: number; share_of_clean: number; median_abs_deviation: number | null; share_beyond_tolerance: number | null; tolerance: number };
      vur: Record<string, { n: number; with_asof_valuation: number; share: number; price_to_valuation_median: number | null; share_by_year: Record<string, number> }>;
      sales_per_year: Record<string, Record<string, number>>;
      properties: Record<string, { sales: number; unique_properties: number; repeat_sale_properties: number }>;
    };
    descriptive: { yearly: Record<string, YearlyRow[]>; quarterly: Record<string, { quarter: string; n: number; median_ppsqm: number | null }[]> };
    rolling: {
      test_years: number[];
      pooled: SegmentMethodRow[];
      cells: Record<"price_class" | "age_class" | "block", (SegmentMethodRow & Record<string, string | number | boolean | null>)[]>;
      common_subset_with_valuation: SegmentMethodRow[];
      paired_vs_baseline: PairedRow[];
      scatter: Record<string, { method: HedonicMethod; points: [number, number][] }>;
    };
    sensitivity_exclude_flagged_train: SegmentMethodRow[];
    spatial_blocks_within_9000: { pooled: SegmentMethodRow[]; note: string };
    decision: Record<string, { recommended: HedonicMethod | null; best_baseline: HedonicMethod; reason: string }>;
    method_labels: Record<HedonicMethod, string>;
  };
  final: { pristine: boolean; from: string; summary: SegmentMethodRow[]; decision_sha256: string };
  scoring: {
    meta: { as_of: string; index_month_wanted: string; index_month_used: string; index_months_stale: number; index_value: number };
    segments: Record<string, ScoringSegment>;
    reasons: Record<string, string>;
    post_hoc_relative_level: Record<string, { year: number; n: number; unique_properties: number; median_price_vs_index_area: number }[]>;
  };
  provenance: {
    generated_at: string;
    seed: number;
    config_sha256: string;
    data_sha256: Record<string, string>;
    git_commit: string | null;
    python: string;
    packages: Record<string, string>;
  };
}

export const hedonicResults = resultsJson as unknown as HedonicResults;

/** Mindste relative forbedring i MdAPE, en challenger skal opnå (fra den frosne konfiguration). */
export function minRelativeImprovement(r: HedonicResults): number | null {
  const cfg = (r.provenance as unknown as { config?: { decision?: { min_relative_improvement?: number } } }).config;
  return cfg?.decision?.min_relative_improvement ?? null;
}

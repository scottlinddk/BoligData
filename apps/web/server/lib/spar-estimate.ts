import {
  fairPrice, localLevelIndex, selectValuation, trimSparSales,
  type LocalLevelPoint, type SparSale, type SparValuation,
} from "../../../../packages/shared/src/analysis/spar.js";
import type { SparListingEstimate } from "../../../../packages/shared/src/types/spar.js";

/** Below this many trimmed free-trade sales the index is noise, so no estimate is shown. */
export const SPAR_MIN_SALES = 20;
/** An index whose newest month is older than this is still shown, but flagged as old. */
export const SPAR_STALE_AFTER_MONTHS = 12;

export interface SparValuationRow extends SparValuation { propertyId: string }
export interface SparSaleRow { id: string; propertyId: string; soldDate: string; price: number; saleType: string | null }

export interface SparSegment {
  isUnit: boolean;
  asOf: string;
  vintage: number | null;
  /** Latest valuation per property, restricted to the segment's BFE type. */
  valuationByProperty: Map<string, SparValuation>;
  nSales: number;
  points: LocalLevelPoint[];
  /** Spread of one sale's log ratio around the smoothed level (in-sample). */
  residualSd: number;
  unavailable: "too_few_sales" | null;
  /** Months from the newest index month to the as-of date. Shown to the user, never used to hide the estimate. */
  ageMonths: number;
}

const monthIndex = (period: string) => { const [y, m] = period.split("-").map(Number); return y! * 12 + (m! - 1); };

/**
 * Builds one index per property class. Every sale is related to the same valuation vintage (the
 * most common latest year in the class), so the ratio and the listing's own valuation share a base.
 * This is the current-state index, not a backtest: valuations are taken as known today.
 */
export function buildSparSegment(input: { asOf: string; isUnit: boolean; valuations: SparValuationRow[]; sales: SparSaleRow[] }): SparSegment {
  const byProperty = new Map<string, SparValuation[]>();
  for (const v of input.valuations) (byProperty.get(v.propertyId) ?? byProperty.set(v.propertyId, []).get(v.propertyId)!).push(v);
  const valuationByProperty = new Map<string, SparValuation>();
  for (const [id, list] of byProperty) {
    const v = selectValuation(list, { asOf: input.asOf, isUnit: input.isUnit });
    if (v) valuationByProperty.set(id, v);
  }
  const counts = new Map<number, number>();
  for (const v of valuationByProperty.values()) counts.set(v.valuationYear, (counts.get(v.valuationYear) ?? 0) + 1);
  const vintage = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null;
  const empty = (unavailable: SparSegment["unavailable"], nSales = 0): SparSegment =>
    ({ isUnit: input.isUnit, asOf: input.asOf, vintage, valuationByProperty, nSales, points: [], residualSd: 0, unavailable, ageMonths: 0 });
  if (vintage === null) return empty("too_few_sales");

  const sparSales: SparSale[] = [];
  for (const s of input.sales) {
    const v = valuationByProperty.get(s.propertyId);
    if (!v || v.valuationYear !== vintage) continue;
    sparSales.push({ id: s.id, agreementDate: s.soldDate, price: s.price, valuation: v.value, freeTrade: s.saleType === "normal" });
  }
  const kept = trimSparSales(sparSales).kept;
  if (kept.length < SPAR_MIN_SALES) return empty("too_few_sales", kept.length);
  const points = localLevelIndex(sparSales, { granularity: "month", asOf: input.asOf });
  const last = points[points.length - 1];
  if (!last) return empty("too_few_sales", kept.length);
  const ageMonths = Math.max(0, monthIndex(input.asOf.slice(0, 7)) - monthIndex(last.period));

  const level = new Map(points.map((p) => [p.period, p.estimate]));
  const residuals = kept.map((s) => Math.log(s.price / s.valuation) - Math.log(level.get(s.agreementDate.slice(0, 7))!));
  const residualSd = Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / Math.max(residuals.length - 1, 1));
  return { isUnit: input.isUnit, asOf: input.asOf, vintage, valuationByProperty, nSales: kept.length, points, residualSd, unavailable: null, ageMonths };
}

export function estimateForListing(segment: SparSegment, listing: { propertyId: string; askingPrice: number | null }): SparListingEstimate {
  const base = { isUnit: segment.isUnit, asOf: segment.asOf, method: "own-spar-local-level/1" as const, askingPrice: listing.askingPrice };
  const none = (status: SparListingEstimate["status"], reason: SparListingEstimate["reason"], valuation: SparListingEstimate["valuation"] = null): SparListingEstimate =>
    ({ ...base, status, reason, valuation, index: null, fairPrice: null, askingVsFair: null });

  const own = segment.valuationByProperty.get(listing.propertyId);
  if (!own) return none("no_valuation", "no_valuation_for_property");
  const valuation = { valueDkk: own.value, year: own.valuationYear, bfe: own.bfe };
  if (segment.unavailable) return none("insufficient_data", segment.unavailable, valuation);
  if (own.valuationYear !== segment.vintage) return none("no_valuation", "valuation_vintage_mismatch", valuation);

  const point = segment.points[segment.points.length - 1]!;
  const fair = fairPrice(own.value, point, 0, segment.residualSd);
  if (!fair) return none("no_valuation", "no_valuation_for_property");
  const asking = listing.askingPrice !== null && listing.askingPrice > 0 ? listing.askingPrice : null;
  return {
    ...base, status: "available", reason: null, valuation,
    index: { period: point.period, ratio: point.estimate, lo80: point.lo80, hi80: point.hi80, nPeriod: point.n, nSales: segment.nSales, valuationVintage: segment.vintage!, preliminary: point.preliminary,
      ageMonths: segment.ageMonths, stale: segment.ageMonths > SPAR_STALE_AFTER_MONTHS },
    fairPrice: fair,
    askingVsFair: asking === null ? null : asking / fair.estimate - 1,
  };
}

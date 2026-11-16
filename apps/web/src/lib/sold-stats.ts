import type { SoldArea, SoldProperty } from "@shared/types/sold";

/** A sale with the figures derived from it. Derived here, never trusted from the source sheet. */
export interface SoldRow extends SoldProperty {
  pricePerSqm: number | null;
  /** (listing - sold) / listing * 100. Positive: sold under the listing price. Negative: sold over it. */
  discountPct: number | null;
}

export type SoldMetric = "askPrice" | "discountPct" | "daysOnMarket";
export const SOLD_METRICS: readonly SoldMetric[] = ["askPrice", "discountPct", "daysOnMarket"];

export type AreaFilter = "all" | SoldArea;

export function discountPct(ask: number | null, sold: number | null): number | null {
  if (ask === null || sold === null || ask <= 0 || sold <= 0) return null;
  return ((ask - sold) / ask) * 100;
}

export function toRow(sale: SoldProperty): SoldRow {
  const usableArea = sale.areaSqm !== null && sale.areaSqm > 0 && !sale.areaUncertain;
  return {
    ...sale,
    pricePerSqm: usableArea && sale.soldPrice !== null && sale.soldPrice > 0 ? sale.soldPrice / (sale.areaSqm as number) : null,
    discountPct: discountPct(sale.askPrice, sale.soldPrice),
  };
}

export function toRows(sales: readonly SoldProperty[]): SoldRow[] {
  return sales.map(toRow);
}

export interface SoldFilter {
  area: AreaFilter;
  /** Leave out sales flagged as distorting (part sales, teardowns, ruins). */
  excludeOutliers: boolean;
}

export function applyFilter(rows: readonly SoldRow[], filter: SoldFilter): SoldRow[] {
  return rows.filter((r) => (filter.area === "all" || r.area === filter.area) && !(filter.excludeOutliers && r.outlierReason !== null));
}

export interface Average {
  mean: number;
  median: number;
  /** How many sales had this figure. Differs per column because data are missing. */
  n: number;
}

export function average(values: ReadonlyArray<number | null>): Average | null {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = nums.length >> 1;
  return {
    mean: nums.reduce((sum, v) => sum + v, 0) / nums.length,
    median: nums.length % 2 === 1 ? nums[mid]! : (nums[mid - 1]! + nums[mid]!) / 2,
    n: nums.length,
  };
}

/** A sale whose area is disputed does not count towards the area average either. */
const areaOf = (r: SoldRow) => (r.areaUncertain ? null : r.areaSqm);

export interface SoldSummary {
  count: number;
  soldPrice: Average | null;
  areaSqm: Average | null;
  pricePerSqm: Average | null;
  askPrice: Average | null;
  daysOnMarket: Average | null;
  discountPct: Average | null;
}

export function summarize(rows: readonly SoldRow[]): SoldSummary {
  return {
    count: rows.length,
    soldPrice: average(rows.map((r) => r.soldPrice)),
    areaSqm: average(rows.map(areaOf)),
    pricePerSqm: average(rows.map((r) => r.pricePerSqm)),
    askPrice: average(rows.map((r) => r.askPrice)),
    daysOnMarket: average(rows.map((r) => r.daysOnMarket)),
    discountPct: average(rows.map((r) => r.discountPct)),
  };
}

/** The value a map layer is coloured by, or null when the sale has no such figure. */
export function metricValue(row: SoldRow, metric: SoldMetric): number | null {
  return row[metric];
}

export type SortKey =
  | "address" | "area" | "soldDate" | "areaSqm" | "plotSqm" | "askPrice" | "soldPrice"
  | "pricePerSqm" | "daysOnMarket" | "discountPct" | "builtYear" | "energyLabel";

export function sortRows(rows: readonly SoldRow[], key: SortKey, direction: "asc" | "desc"): SoldRow[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    // A missing value sorts last in both directions: it is not "the lowest".
    if (av === null && bv === null) return a.address.localeCompare(b.address, "da");
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "da");
    return cmp === 0 ? a.address.localeCompare(b.address, "da") : cmp * sign;
  });
}

import type { Property, SaleType, SoldPriceEntry } from "@shared/types/index";

export type PriceHistoryEvent = "listed" | "original_asking" | "sold";

export interface PriceHistoryRow {
  /** ISO day, or null when the source gives no date. */
  date: string | null;
  event: PriceHistoryEvent;
  price: number;
  /** Only set for sales that were not an ordinary free-market trade. */
  saleType: Exclude<SaleType, "normal"> | null;
}

export interface PriceHistoryInput {
  property: Pick<Property, "status" | "price" | "listingDate">;
  /** Registered sales of this address. */
  sales: SoldPriceEntry[];
  /** Verified original asking price for the current listing, when evidence exists. */
  originalAsking: { price: number; date: string | null } | null;
}

const day = (value: string | null | undefined) => value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;

/**
 * Newest first, undated rows last. Only events the app has evidence for appear: the current listing,
 * its original asking price when verified, and registered sales. Nothing is interpolated.
 */
export function buildPriceHistoryRows({ property, sales, originalAsking }: PriceHistoryInput): PriceHistoryRow[] {
  const rows: PriceHistoryRow[] = [];
  if (property.status === "active" && property.price > 0) rows.push({ date: day(property.listingDate), event: "listed", price: property.price, saleType: null });
  if (originalAsking && originalAsking.price > 0 && property.status === "active") {
    rows.push({ date: day(originalAsking.date), event: "original_asking", price: originalAsking.price, saleType: null });
  }
  for (const sale of sales) {
    if (!(sale.price > 0)) continue;
    rows.push({ date: day(sale.soldDate), event: "sold", price: sale.price, saleType: sale.saleType && sale.saleType !== "normal" ? sale.saleType : null });
  }
  return rows.sort((a, b) => a.date === b.date ? 0 : a.date === null ? 1 : b.date === null ? -1 : a.date < b.date ? 1 : -1);
}

import type { SoldPriceEntry } from "@shared/types/index";

export type SaleKind = "normal" | "family" | "auction" | "other";

export interface SaleRow {
  /** ISO date, YYYY-MM-DD. */
  soldDate: string;
  year: number;
  price: number;
  pricePerSqm: number | null;
  saleType: SaleKind;
}

export interface SalesSummary {
  /** Newest first. */
  rows: SaleRow[];
  latest: SaleRow | null;
  /**
   * The newest arm's-length sale, set only when `latest` is not one (a family transfer or a forced auction says
   * little about market value) and an older ordinary sale exists to point to instead.
   */
  latestFreeTrade: SaleRow | null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toRow(entry: SoldPriceEntry): SaleRow | null {
  const match = ISO_DATE.exec(entry.soldDate);
  if (!match || !Number.isFinite(entry.price) || entry.price <= 0) return null;
  const perSqm = entry.pricePerSqm;
  return {
    soldDate: entry.soldDate,
    year: Number(match[1]),
    price: entry.price,
    pricePerSqm: perSqm !== null && Number.isFinite(perSqm) && perSqm > 0 ? perSqm : null,
    // Same reading as the comparables panel: a sale with no recorded type is shown as an ordinary one.
    saleType: entry.saleType ?? "normal",
  };
}

/** Does not trust the input order: the register's list is sorted by the mapper today, and a page should not depend on that. */
export function summarizeSales(history: SoldPriceEntry[]): SalesSummary {
  const rows = history
    .map(toRow)
    .filter((row): row is SaleRow => row !== null)
    .sort((a, b) => b.soldDate.localeCompare(a.soldDate));
  const latest = rows[0] ?? null;
  const latestFreeTrade = latest !== null && latest.saleType !== "normal" ? (rows.find((row) => row.saleType === "normal") ?? null) : null;
  return { rows, latest, latestFreeTrade };
}

const LOCALE = { da: "da-DK", en: "en-GB" } as const;

/** "15. september 2018" / "15 September 2018". A string that is not a real calendar date is returned unchanged. */
export function formatSaleDate(isoDate: string, language: "da" | "en", style: "long" | "short" = "long"): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match) return isoDate;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return isoDate;
  return date.toLocaleDateString(LOCALE[language], style === "long"
    ? { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }
    : { day: "numeric", month: "short", timeZone: "UTC" });
}

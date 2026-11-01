import type { Language } from "@/i18n/translations";

export interface StatsFormat {
  /** 27690 -> "27.690" (da) / "27,690" (en). */
  int: (value: number) => string;
  /** One decimal. */
  one: (value: number) => string;
  /** Signed percent with one decimal, e.g. "+14.9%"; "-" when there is no value. */
  percent: (value: number | null) => string;
  /** Unsigned percent with one decimal, for sentences that already say "rose" or "fell". */
  abs: (value: number | null) => string;
  /** Correlation coefficient with two decimals; "-" when undefined. */
  corr: (value: number | null) => string;
  /** "2026-09" -> "sep. 2026" (da) / "Sept 2026" (en). */
  month: (month: string) => string;
}

export function makeStatsFormat(language: Language): StatsFormat {
  const locale = language === "da" ? "da-DK" : "en-GB";
  const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const oneDecimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const twoDecimals = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const monthName = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" });
  return {
    int: (value) => integer.format(value),
    one: (value) => oneDecimal.format(value),
    percent: (value) => (value === null ? "-" : `${value > 0 ? "+" : ""}${oneDecimal.format(value)}%`),
    abs: (value) => (value === null ? "-" : `${oneDecimal.format(Math.abs(value))}%`),
    corr: (value) => (value === null ? "-" : twoDecimals.format(value)),
    month: (month) => monthName.format(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1))),
  };
}

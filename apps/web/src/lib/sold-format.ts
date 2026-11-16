import type { Language } from "@/i18n/translations";
import type { SoldMetric } from "@/lib/sold-stats";

export interface SoldFormat {
  int: (v: number | null) => string;
  /** 4 250 000 -> "4.250.000 kr." */
  dkk: (v: number | null) => string;
  /** 4 250 000 -> "4,25 mio. kr." for legends and cards. */
  dkkShort: (v: number | null) => string;
  /** Sold under listing price is positive. Over listing price gets a minus sign. */
  discount: (v: number | null) => string;
  days: (v: number | null) => string;
  sqm: (v: number | null) => string;
  /** "2025-10-07" -> "7. okt. 2025", "2025-10" -> "okt. 2025". */
  date: (iso: string | null) => string;
  metric: (metric: SoldMetric, v: number) => string;
}

const DASH = "–";

export function makeSoldFormat(language: Language): SoldFormat {
  const locale = language === "da" ? "da-DK" : "en-GB";
  const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const oneDecimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const twoDecimals = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const month = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" });

  const int = (v: number | null) => (v === null ? DASH : integer.format(v));
  const dkk = (v: number | null) => (v === null ? DASH : `${integer.format(v)} kr.`);
  const dkkShort = (v: number | null) => {
    if (v === null) return DASH;
    return Math.abs(v) >= 1_000_000 ? `${twoDecimals.format(v / 1_000_000)} mio. kr.` : dkk(v);
  };
  const discount = (v: number | null) => {
    if (v === null) return DASH;
    const text = `${oneDecimal.format(Math.abs(v))} %`;
    return v < -0.05 ? `−${text}` : text;
  };
  const days = (v: number | null) => (v === null ? DASH : `${integer.format(v)} ${language === "da" ? "dage" : "days"}`);
  const sqm = (v: number | null) => (v === null ? DASH : `${integer.format(v)} m²`);
  const date = (iso: string | null) => {
    if (!iso) return DASH;
    if (/^\d{4}-\d{2}$/.test(iso)) return month.format(new Date(`${iso}-01T00:00:00Z`));
    const parsed = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? DASH : day.format(parsed);
  };
  const metric = (m: SoldMetric, v: number) => (m === "askPrice" ? dkkShort(v) : m === "discountPct" ? discount(v) : days(v));
  return { int, dkk, dkkShort, discount, days, sqm, date, metric };
}

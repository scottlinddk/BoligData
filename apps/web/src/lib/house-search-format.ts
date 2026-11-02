import type { Language } from "@/i18n/translations";

const locale = (language: Language) => (language === "da" ? "da-DK" : "en-GB");

/** "3.495.000 kr." in Danish, "DKK 3,495,000" in English. */
export function formatDkk(value: number, language: Language): string {
  return new Intl.NumberFormat(locale(language), { style: "currency", currency: "DKK", maximumFractionDigits: 0 }).format(value);
}

/** Compact price for chart axes and ranges: "3,5 mio." / "3.5M". */
export function formatDkkShort(value: number, language: Language): string {
  if (Math.abs(value) < 1_000_000) return formatDkk(value, language);
  const millions = value / 1_000_000;
  const text = new Intl.NumberFormat(locale(language), { maximumFractionDigits: 2 }).format(millions);
  return language === "da" ? `${text} mio. kr.` : `DKK ${text}M`;
}

export function formatDate(iso: string, language: Language): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale(language), { day: "numeric", month: "short", year: "numeric" }).format(new Date(y, m - 1, d));
}

/** "2026-10" -> "okt. 2026". */
export function formatMonth(month: string, language: Language): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat(locale(language), { month: "short", year: "numeric" }).format(new Date(y, m - 1, 1));
}

export function formatNumber(value: number, language: Language): string {
  return new Intl.NumberFormat(locale(language), { maximumFractionDigits: 1 }).format(value);
}

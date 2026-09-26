import type { ReactNode } from "react";
import { useI18n } from "@/i18n/i18n";

export const inputClass = "mt-1 w-full rounded-xl border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand";
export const buttonClass = "rounded-full border border-border-strong bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-hover disabled:opacity-50";
export const primaryClass = "rounded-full bg-cta px-4 py-2 text-sm font-semibold text-cta-text disabled:opacity-50";
export function useResearchText() { const { language } = useI18n(); return (da: string, en: string) => language === "da" ? da : en; }
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-semibold text-ink-soft">{label}{children}</label>;
}
export function NumberField({ label, value, onChange, step = 1 }: { label: string; value: number | null; onChange: (value: number | null) => void; step?: number }) {
  return <Field label={label}><input className={inputClass} type="number" min="0" step={step} value={value ?? ""} onChange={e => onChange(e.target.value === "" || !Number.isFinite(e.target.valueAsNumber) ? null : e.target.valueAsNumber)} /></Field>;
}
export function TextField({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return <Field label={label}>{multiline ? <textarea className={inputClass} rows={3} value={value} onChange={e => onChange(e.target.value)} /> : <input className={inputClass} value={value} onChange={e => onChange(e.target.value)} />}</Field>;
}
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5"><h3 className="mb-3 text-lg font-bold tracking-tight">{title}</h3>{children}</section>;
}
export function Money({ value }: { value: number | null | undefined }) {
  const { language } = useI18n();
  return <>{value === null || value === undefined ? (language === "da" ? "Ukendt" : "Unknown") : new Intl.NumberFormat(language === "da" ? "da-DK" : "en-GB", { style: "currency", currency: "DKK", maximumFractionDigits: 0 }).format(value)}</>;
}
export function Percent({ value }: { value: number | null }) { return <>{value === null ? "—" : `${value.toFixed(2)} %`}</>; }
export function Status({ value }: { value: "met" | "failed" | "unknown" }) {
  const tx = useResearchText();
  const label = value === "met" ? tx("Opfyldt", "Met") : value === "failed" ? tx("Ikke opfyldt", "Not met") : tx("Ukendt", "Unknown");
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${value === "met" ? "bg-success-soft text-success" : value === "failed" ? "bg-danger-soft text-danger" : "bg-unknown-soft text-ink-soft"}`}>{label}</span>;
}

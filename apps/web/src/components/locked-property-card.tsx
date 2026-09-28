import { Link } from "react-router-dom";
import type { PropertySummary } from "@shared/types/index";
import { useI18n } from "@/i18n/i18n";
import { BrandMark } from "./brand-mark";

/** Anonymous responses include identity/address only; no invented photos, prices or areas. */
export function LockedPropertyCard({ summary }: { summary: PropertySummary }) {
  const { t } = useI18n();
  return <Link to={`/property/${summary.id}`} className="group block min-w-0 rounded-2xl text-ink">
    <div className="flex aspect-[8/5] flex-col items-center justify-center gap-3 rounded-2xl bg-surface-alt text-ink-faint"><BrandMark className="h-10 w-10 opacity-60" /><span className="text-xs">{t("property.noPhoto")}</span></div>
    <div className="px-0.5 pt-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-brand-text"><svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V4a3 3 0 0 1 6 0v3" /></svg>{t("search.signInLock")}</p>
      <h3 className="mt-2 text-sm font-medium leading-5 transition-colors group-hover:text-brand-text">{summary.address}</h3>
    </div>
  </Link>;
}

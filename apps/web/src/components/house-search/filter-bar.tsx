import { HOUSE_SEARCH_STATUSES, type HouseSearchStatus } from "@shared/types/house-search";
import { buttonClass, inputClass } from "@/components/research/fields";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import { hasActiveFilters, type HouseSearchFilters } from "@/lib/house-search-filters";

interface FilterBarProps {
  filters: HouseSearchFilters;
  onChange: (next: HouseSearchFilters) => void;
  shown: number;
  total: number;
}

export function FilterBar({ filters, onChange, shown, total }: FilterBarProps) {
  const { t } = useI18n();
  const toggle = (status: HouseSearchStatus) =>
    onChange({
      ...filters,
      statuses: filters.statuses.includes(status) ? filters.statuses.filter((s) => s !== status) : [...filters.statuses, status],
    });

  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-2xl border border-border bg-surface p-3 sm:p-4">
      <div role="group" aria-label={t("hs.filter.status")} className="flex flex-wrap gap-1.5">
        {HOUSE_SEARCH_STATUSES.map((status) => {
          const active = filters.statuses.includes(status);
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(status)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${active ? "border-cta bg-cta text-cta-text" : "border-border-strong bg-surface text-ink hover:bg-surface-hover"}`}
            >
              {t(`hs.status.${status}` as TranslationKey)}
            </button>
          );
        })}
      </div>

      <label className="grid gap-0.5 text-xs font-semibold text-ink-soft">
        {t("hs.filter.from")}
        <input className={`${inputClass} !mt-0.5 !w-auto !py-1.5`} type="date" value={filters.from ?? ""} max={filters.to ?? undefined} onChange={(e) => onChange({ ...filters, from: e.target.value || null })} />
      </label>
      <label className="grid gap-0.5 text-xs font-semibold text-ink-soft">
        {t("hs.filter.to")}
        <input className={`${inputClass} !mt-0.5 !w-auto !py-1.5`} type="date" value={filters.to ?? ""} min={filters.from ?? undefined} onChange={(e) => onChange({ ...filters, to: e.target.value || null })} />
      </label>

      {hasActiveFilters(filters) && (
        <button type="button" className={`${buttonClass} !py-1.5`} onClick={() => onChange({ statuses: [], from: null, to: null })}>
          {t("hs.filter.clear")}
        </button>
      )}
      <p className="ml-auto text-sm text-ink-soft" aria-live="polite">{t("hs.filter.shown", { shown, total })}</p>
    </div>
  );
}

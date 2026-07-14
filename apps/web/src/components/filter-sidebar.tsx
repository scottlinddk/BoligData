import type { FiltersWithSort } from "@/lib/url-filters";
import { FilterFields, countActiveFilters } from "@/components/filter-fields";
import { useI18n } from "@/i18n/i18n";

interface FilterSidebarProps {
  filters: FiltersWithSort;
  onChange: (patch: Partial<FiltersWithSort>) => void;
}

export function FilterSidebar({ filters, onChange }: FilterSidebarProps) {
  const { t } = useI18n();
  const activeCount = countActiveFilters(filters);

  return (
    <aside className="sticky top-[78px] flex w-64 shrink-0 flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-4.5 shadow-card">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-widest text-ink">{t("filters.title")}</span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => onChange({ location: null, postnummer: null, minPrice: null, maxPrice: null, minSqm: null, maxSqm: null, maxDaysOnMarket: null, minBuildingYear: null, maxBuildingYear: null })}
            className="font-mono text-[10.5px] uppercase tracking-widest text-brand-text"
          >
            {t("filters.reset")}
          </button>
        )}
      </div>

      <FilterFields filters={filters} onChange={onChange} />
    </aside>
  );
}

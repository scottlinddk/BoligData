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
    <aside className="sticky top-20 flex w-[280px] shrink-0 flex-col gap-5 rounded-[22px] bg-surface-alt p-5">
      <div className="flex items-center justify-between">
        <span className="text-lg font-medium tracking-tight text-ink">{t("filters.title")}</span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() =>
              onChange({
                location: null,
                postnummer: null,
                propertyTypes: null,
                minPrice: null,
                maxPrice: null,
                minSqm: null,
                maxSqm: null,
                maxDaysOnMarket: null,
                minBuildingYear: null,
                maxBuildingYear: null,
              })
            }
            className="text-xs font-medium text-ink-soft underline underline-offset-4 hover:text-ink"
          >
            {t("filters.reset")}
          </button>
        )}
      </div>

      <FilterFields filters={filters} onChange={onChange} />
    </aside>
  );
}

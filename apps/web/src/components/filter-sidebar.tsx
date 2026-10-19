import type { FiltersWithSort } from "@/lib/url-filters";
import { FilterFields, countActiveFilters } from "@/components/filter-fields";
import { useI18n } from "@/i18n/i18n";

interface FilterSidebarProps {
  filters: FiltersWithSort;
  onChange: (patch: Partial<FiltersWithSort>) => void;
}

/** Always-visible desktop filters. Location lives in the search bar above the results. */
export function FilterSidebar({ filters, onChange }: FilterSidebarProps) {
  const { t } = useI18n();
  const activeCount = countActiveFilters(filters);

  return (
    <aside aria-label={t("filters.title")} className="grid content-start gap-7">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <span className="text-[15px] font-semibold text-ink">{t("filters.title")}</span>
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
      <FilterFields filters={filters} onChange={onChange} variant="sidebar" />
    </aside>
  );
}

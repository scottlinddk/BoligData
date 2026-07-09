import type { FiltersWithSort } from "@/lib/url-filters";
import { SORT_OPTIONS } from "@/lib/constants";
import { useI18n } from "@/i18n/i18n";

interface FilterSidebarProps {
  filters: FiltersWithSort;
  onChange: (patch: Partial<FiltersWithSort>) => void;
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
      {label}
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
    </label>
  );
}

export function FilterSidebar({ filters, onChange }: FilterSidebarProps) {
  const { t } = useI18n();

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
        {t("filters.location")}
        <input
          type="text"
          placeholder={t("filters.locationPlaceholder")}
          value={filters.location ?? ""}
          onChange={(e) => onChange({ location: e.target.value || null })}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <NumberField label={t("filters.minPrice")} value={filters.minPrice} onChange={(v) => onChange({ minPrice: v })} />
        <NumberField label={t("filters.maxPrice")} value={filters.maxPrice} onChange={(v) => onChange({ maxPrice: v })} />
        <NumberField label={t("filters.minSqm")} value={filters.minSqm} onChange={(v) => onChange({ minSqm: v })} />
        <NumberField label={t("filters.maxSqm")} value={filters.maxSqm} onChange={(v) => onChange({ maxSqm: v })} />
        <NumberField
          label={t("filters.minBuildingYear")}
          value={filters.minBuildingYear}
          onChange={(v) => onChange({ minBuildingYear: v })}
        />
        <NumberField
          label={t("filters.maxBuildingYear")}
          value={filters.maxBuildingYear}
          onChange={(v) => onChange({ maxBuildingYear: v })}
        />
      </div>

      <NumberField
        label={t("filters.maxDaysOnMarket")}
        value={filters.maxDaysOnMarket}
        onChange={(v) => onChange({ maxDaysOnMarket: v })}
      />

      <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
        {t("filters.sortBy")}
        <select
          value={`${filters.sortField}:${filters.sortDirection}`}
          onChange={(e) => {
            const [sortField, sortDirection] = e.target.value.split(":");
            onChange({
              sortField: sortField as FiltersWithSort["sortField"],
              sortDirection: sortDirection as FiltersWithSort["sortDirection"],
            });
          }}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          {SORT_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {t(`sort.${value}`)}
            </option>
          ))}
        </select>
      </label>
    </aside>
  );
}

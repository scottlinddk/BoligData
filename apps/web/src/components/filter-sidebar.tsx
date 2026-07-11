import type { FiltersWithSort } from "@/lib/url-filters";
import { SORT_OPTIONS } from "@/lib/constants";
import { useI18n } from "@/i18n/i18n";

interface FilterSidebarProps {
  filters: FiltersWithSort;
  onChange: (patch: Partial<FiltersWithSort>) => void;
}

const FIELD_LABEL = "flex flex-col gap-1.5 text-xs font-bold text-ink-soft";
const FIELD_INPUT =
  "rounded-lg border border-border bg-paper px-2.5 py-2 text-sm font-medium text-ink placeholder:text-ink-faint";

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
    <label className={FIELD_LABEL}>
      {label}
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={FIELD_INPUT}
      />
    </label>
  );
}

export function FilterSidebar({ filters, onChange }: FilterSidebarProps) {
  const { t } = useI18n();

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-3.5 rounded-2xl border border-border bg-surface p-4.5">
      <span className="font-mono text-xs uppercase tracking-widest text-ink">{t("filters.title")}</span>

      <label className={FIELD_LABEL}>
        {t("filters.location")}
        <input
          type="text"
          placeholder={t("filters.locationPlaceholder")}
          value={filters.location ?? ""}
          onChange={(e) => onChange({ location: e.target.value || null })}
          className={FIELD_INPUT}
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

      <label className={FIELD_LABEL}>
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
          className={FIELD_INPUT}
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

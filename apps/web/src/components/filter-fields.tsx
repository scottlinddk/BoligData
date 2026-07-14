import type { FiltersWithSort } from "@/lib/url-filters";
import { SORT_OPTIONS } from "@/lib/constants";
import { useI18n } from "@/i18n/i18n";

interface FilterFieldsProps {
  filters: FiltersWithSort;
  onChange: (patch: Partial<FiltersWithSort>) => void;
  fieldLabelClassName?: string;
  fieldInputClassName?: string;
}

function NumberField({
  label,
  value,
  onChange,
  labelClassName,
  inputClassName,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  labelClassName: string;
  inputClassName: string;
}) {
  return (
    <label className={labelClassName}>
      {label}
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={inputClassName}
      />
    </label>
  );
}

/** Shared filter form fields, laid out by the caller (desktop sidebar vs. mobile bottom sheet). */
export function FilterFields({
  filters,
  onChange,
  fieldLabelClassName = "flex flex-col gap-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-soft",
  fieldInputClassName = "rounded-full border border-border bg-surface-alt px-3 py-2 font-sans text-sm font-medium normal-case tracking-normal text-ink placeholder:text-ink-faint",
}: FilterFieldsProps) {
  const { t } = useI18n();
  const label = fieldLabelClassName;
  const input = fieldInputClassName;

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>
          {t("filters.location")}
          <input
            type="text"
            placeholder={t("filters.locationPlaceholder")}
            value={filters.location ?? ""}
            onChange={(e) => onChange({ location: e.target.value || null })}
            className={input}
          />
        </label>
        <label className={label}>
          {t("filters.postnummer")}
          <input
            type="text"
            inputMode="numeric"
            placeholder={t("filters.postnummerPlaceholder")}
            value={filters.postnummer ?? ""}
            onChange={(e) => onChange({ postnummer: e.target.value || null })}
            className={input}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label={t("filters.minPrice")}
          value={filters.minPrice}
          onChange={(v) => onChange({ minPrice: v })}
          labelClassName={label}
          inputClassName={input}
        />
        <NumberField
          label={t("filters.maxPrice")}
          value={filters.maxPrice}
          onChange={(v) => onChange({ maxPrice: v })}
          labelClassName={label}
          inputClassName={input}
        />
        <NumberField
          label={t("filters.minSqm")}
          value={filters.minSqm}
          onChange={(v) => onChange({ minSqm: v })}
          labelClassName={label}
          inputClassName={input}
        />
        <NumberField
          label={t("filters.maxSqm")}
          value={filters.maxSqm}
          onChange={(v) => onChange({ maxSqm: v })}
          labelClassName={label}
          inputClassName={input}
        />
        <NumberField
          label={t("filters.minBuildingYear")}
          value={filters.minBuildingYear}
          onChange={(v) => onChange({ minBuildingYear: v })}
          labelClassName={label}
          inputClassName={input}
        />
        <NumberField
          label={t("filters.maxBuildingYear")}
          value={filters.maxBuildingYear}
          onChange={(v) => onChange({ maxBuildingYear: v })}
          labelClassName={label}
          inputClassName={input}
        />
      </div>

      <NumberField
        label={t("filters.maxDaysOnMarket")}
        value={filters.maxDaysOnMarket}
        onChange={(v) => onChange({ maxDaysOnMarket: v })}
        labelClassName={label}
        inputClassName={input}
      />

      <label className={label}>
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
          className={input}
        >
          {SORT_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {t(`sort.${value}`)}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

/** Number of PropertyFilters (excluding sort) currently set — used for the mobile filter badge. */
export function countActiveFilters(filters: FiltersWithSort): number {
  const { sortField: _sortField, sortDirection: _sortDirection, ...rest } = filters;
  return Object.values(rest).filter((v) => v !== null && v !== "").length;
}

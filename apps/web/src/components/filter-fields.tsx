import type { ReactNode } from "react";
import type { PropertyType } from "@shared/types/index";
import type { FiltersWithSort } from "@/lib/url-filters";
import { PROPERTY_TYPE_OPTIONS, SORT_OPTIONS } from "@/lib/constants";
import { useI18n } from "@/i18n/i18n";

interface FilterFieldsProps {
  filters: FiltersWithSort;
  onChange: (patch: Partial<FiltersWithSort>) => void;
  fieldLabelClassName?: string;
  fieldInputClassName?: string;
  /** "sidebar" is the always-visible desktop panel: checkbox list, no location (the search bar has it), no sort. */
  variant?: "sheet" | "sidebar";
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
        inputMode="numeric"
        enterKeyHint="done"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={inputClassName}
      />
    </label>
  );
}

function FieldGroup({ title, children, sidebar }: { title: string; children: ReactNode; sidebar: boolean }) {
  return (
    <section className="col-span-full">
      <h3 className={`mb-3 font-semibold text-ink ${sidebar ? "text-[15px]" : "text-base"}`}>{title}</h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

/** Shared filter form fields, laid out by the caller (desktop sidebar vs. mobile bottom sheet). */
export function FilterFields({
  filters,
  onChange,
  fieldLabelClassName,
  fieldInputClassName,
  variant = "sheet",
}: FilterFieldsProps) {
  const { t, language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const sidebar = variant === "sidebar";
  const label = fieldLabelClassName ?? (sidebar ? "flex min-w-0 flex-col gap-1.5 text-[11px] font-medium text-ink-soft" : "flex min-w-0 flex-col gap-2 text-xs font-medium text-ink-soft");
  const input = fieldInputClassName ?? (sidebar
    ? "w-full min-w-0 rounded-md border border-border bg-surface px-3 py-2.5 text-sm font-normal text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
    : "w-full min-w-0 rounded-xl border border-border bg-surface px-3.5 py-3 text-sm font-normal text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-soft");

  return (
    <>
      {!sidebar && <div className="col-span-full grid grid-cols-2 gap-3">
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
      </div>}

      <fieldset className={`col-span-full ${label}`}>
        <legend className={`mb-3 font-semibold text-ink ${sidebar ? "text-[15px]" : "text-base"}`}>{t("filters.propertyType")}</legend>
        <div className={sidebar ? "grid gap-0.5" : "flex flex-wrap gap-2"}>
          {PROPERTY_TYPE_OPTIONS.map((type) => {
            const checked = filters.propertyTypes?.includes(type) ?? false;
            return (
              <label
                key={type}
                className={sidebar ? "flex min-h-9 cursor-pointer items-center gap-3 text-sm font-normal text-ink focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand" : `flex min-h-11 cursor-pointer active:scale-[0.97] items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium normal-case tracking-normal transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand ${
                  checked ? "border-cta bg-cta text-cta-text" : "border-border bg-surface text-ink hover:bg-surface-hover"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const current = filters.propertyTypes ?? [];
                    const next: PropertyType[] = checked
                      ? current.filter((t) => t !== type)
                      : [...current, type];
                    onChange({ propertyTypes: next.length > 0 ? next : null });
                  }}
                  className="sr-only"
                />
                {sidebar && <span aria-hidden="true" className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border ${checked ? "border-cta bg-cta text-cta-text" : "border-border-strong bg-surface"}`}>{checked && <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2.5 6.2 2.3 2.3 4.7-5" /></svg>}</span>}
                {t(`propertyType.${type}`)}
              </label>
            );
          })}
        </div>
      </fieldset>

      <FieldGroup sidebar={sidebar} title={tx("Pris", "Price")}>
        <NumberField label={t("filters.minPrice")} value={filters.minPrice} onChange={(v) => onChange({ minPrice: v })} labelClassName={label} inputClassName={input} />
        <NumberField label={t("filters.maxPrice")} value={filters.maxPrice} onChange={(v) => onChange({ maxPrice: v })} labelClassName={label} inputClassName={input} />
      </FieldGroup>
      <FieldGroup sidebar={sidebar} title={tx("Størrelse", "Size")}>
        <NumberField label={t("filters.minSqm")} value={filters.minSqm} onChange={(v) => onChange({ minSqm: v })} labelClassName={label} inputClassName={input} />
        <NumberField label={t("filters.maxSqm")} value={filters.maxSqm} onChange={(v) => onChange({ maxSqm: v })} labelClassName={label} inputClassName={input} />
      </FieldGroup>
      <FieldGroup sidebar={sidebar} title={tx("Byggeår", "Year built")}>
        <NumberField label={t("filters.minBuildingYear")} value={filters.minBuildingYear} onChange={(v) => onChange({ minBuildingYear: v })} labelClassName={label} inputClassName={input} />
        <NumberField label={t("filters.maxBuildingYear")} value={filters.maxBuildingYear} onChange={(v) => onChange({ maxBuildingYear: v })} labelClassName={label} inputClassName={input} />
      </FieldGroup>

      <FieldGroup sidebar={sidebar} title={sidebar ? tx("Liggetid", "Time on market") : tx("Liggetid og sortering", "Time on market and sorting")}>
        <NumberField
          label={t("filters.maxDaysOnMarket")}
          value={filters.maxDaysOnMarket}
          onChange={(v) => onChange({ maxDaysOnMarket: v })}
          labelClassName={label}
          inputClassName={input}
        />
      {!sidebar && <label className={label}>
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
      </label>}
      </FieldGroup>
    </>
  );
}

/** Number of PropertyFilters (excluding sort) currently set — used for the mobile filter badge. */
export function countActiveFilters(filters: FiltersWithSort): number {
  const { sortField: _sortField, sortDirection: _sortDirection, ...rest } = filters;
  return Object.values(rest).filter((v) => v !== null && v !== undefined && v !== "" && (!Array.isArray(v) || v.length > 0)).length;
}

import type { FiltersWithSort } from "@/lib/url-filters";
import { SORT_OPTIONS } from "@/lib/constants";

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
    <label className="flex flex-col gap-1 text-sm text-slate-600">
      {label}
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="rounded-md border border-slate-300 px-2 py-1"
      />
    </label>
  );
}

export function FilterSidebar({ filters, onChange }: FilterSidebarProps) {
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <label className="flex flex-col gap-1 text-sm text-slate-600">
        Location
        <input
          type="text"
          placeholder="e.g. Aalborg"
          value={filters.location ?? ""}
          onChange={(e) => onChange({ location: e.target.value || null })}
          className="rounded-md border border-slate-300 px-2 py-1"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Min price" value={filters.minPrice} onChange={(v) => onChange({ minPrice: v })} />
        <NumberField label="Max price" value={filters.maxPrice} onChange={(v) => onChange({ maxPrice: v })} />
        <NumberField label="Min sqm" value={filters.minSqm} onChange={(v) => onChange({ minSqm: v })} />
        <NumberField label="Max sqm" value={filters.maxSqm} onChange={(v) => onChange({ maxSqm: v })} />
        <NumberField
          label="Min year built"
          value={filters.minBuildingYear}
          onChange={(v) => onChange({ minBuildingYear: v })}
        />
        <NumberField
          label="Max year built"
          value={filters.maxBuildingYear}
          onChange={(v) => onChange({ maxBuildingYear: v })}
        />
      </div>

      <NumberField
        label="Max days on market"
        value={filters.maxDaysOnMarket}
        onChange={(v) => onChange({ maxDaysOnMarket: v })}
      />

      <label className="flex flex-col gap-1 text-sm text-slate-600">
        Sort by
        <select
          value={`${filters.sortField}:${filters.sortDirection}`}
          onChange={(e) => {
            const [sortField, sortDirection] = e.target.value.split(":");
            onChange({
              sortField: sortField as FiltersWithSort["sortField"],
              sortDirection: sortDirection as FiltersWithSort["sortDirection"],
            });
          }}
          className="rounded-md border border-slate-300 px-2 py-1"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </aside>
  );
}

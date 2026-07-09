import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePropertySearch } from "@/hooks/use-property-search";
import { parseFilters, serializeFilters, type FiltersWithSort } from "@/lib/url-filters";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { FilterSidebar } from "@/components/filter-sidebar";
import { PropertyCard } from "@/components/property-card";
import { PropertyMap } from "@/components/property-map";

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseFilters(searchParams);
  const [offset, setOffset] = useState(0);

  const { data, isLoading, isError } = usePropertySearch(filters, offset);

  function handleFilterChange(patch: Partial<FiltersWithSort>) {
    setOffset(0);
    setSearchParams(serializeFilters({ ...filters, ...patch }));
  }

  const properties = data?.properties ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="mx-auto flex max-w-6xl gap-4 px-4 py-6">
      <FilterSidebar filters={filters} onChange={handleFilterChange} />

      <div className="flex flex-1 flex-col gap-4">
        <div className="h-72 overflow-hidden rounded-lg border border-slate-200">
          <PropertyMap properties={properties} />
        </div>

        {isLoading && <p className="text-slate-500">Loading properties...</p>}
        {isError && <p className="text-red-600">Failed to load properties.</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>

        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            {total > 0 ? `${offset + 1}-${Math.min(offset + DEFAULT_PAGE_SIZE, total)} of ${total}` : "No results"}
          </span>
          <div className="flex gap-2">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - DEFAULT_PAGE_SIZE))}
              className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={offset + DEFAULT_PAGE_SIZE >= total}
              onClick={() => setOffset(offset + DEFAULT_PAGE_SIZE)}
              className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

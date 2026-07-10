import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePropertySearch } from "@/hooks/use-property-search";
import { useAuth } from "@/hooks/use-auth";
import { parseFilters, serializeFilters, type FiltersWithSort } from "@/lib/url-filters";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/constants";
import { FilterSidebar } from "@/components/filter-sidebar";
import { PropertyCard } from "@/components/property-card";
import { PropertyMap } from "@/components/property-map";
import { useI18n } from "@/i18n/i18n";

export function SearchPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseFilters(searchParams);
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const { data, isLoading, isError, refetch } = usePropertySearch(filters, offset, pageSize);

  function handleFilterChange(patch: Partial<FiltersWithSort>) {
    setOffset(0);
    setSearchParams(serializeFilters({ ...filters, ...patch }));
  }

  function handlePageSizeChange(size: number) {
    setOffset(0);
    setPageSize(size);
  }

  const authenticated = data?.authenticated ?? Boolean(user);
  const properties = data?.properties ?? [];
  const summaries = data?.summaries ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? pageSize;

  return (
    <div className="mx-auto flex max-w-6xl gap-4 px-4 py-6">
      <FilterSidebar filters={filters} onChange={handleFilterChange} />

      <div className="flex flex-1 flex-col gap-4">
        {authenticated && (
          <div className="h-72 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <PropertyMap properties={properties} />
          </div>
        )}

        {!authenticated && (
          <div className="rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-brand-100">
            {t("search.signInForDetails")}{" "}
            <Link to="/auth/signin" className="font-semibold underline">
              {t("nav.signIn")}
            </Link>
          </div>
        )}

        {isLoading && <p className="text-slate-500 dark:text-slate-400">{t("search.loading")}</p>}
        {isError && (
          <div className="flex items-center gap-3">
            <p className="text-red-600 dark:text-red-400">{t("search.error")}</p>
            <button
              onClick={() => refetch()}
              className="rounded-md border border-slate-300 px-3 py-1 text-sm dark:border-slate-700"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        {authenticated ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {summaries.map((summary) => (
              <li key={summary.id}>
                <Link
                  to={`/property/${summary.id}`}
                  className="block px-4 py-3 text-slate-900 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  {summary.address}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
          <span>
            {total > 0
              ? t("search.range", {
                  from: offset + 1,
                  to: Math.min(offset + limit, total),
                  total,
                })
              : t("search.noResults")}
          </span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              {t("search.pageSize")}
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40 dark:border-slate-700"
              >
                {t("search.previous")}
              </button>
              <button
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
                className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40 dark:border-slate-700"
              >
                {t("search.next")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

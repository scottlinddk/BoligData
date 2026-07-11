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
    <div className="mx-auto flex max-w-6xl gap-5 px-4 py-6">
      <FilterSidebar filters={filters} onChange={handleFilterChange} />

      <div className="flex flex-1 flex-col gap-3.5">
        {authenticated && (
          <div className="h-72 overflow-hidden rounded-2xl border border-border">
            <PropertyMap properties={properties} />
          </div>
        )}

        {!authenticated && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-text">
            <span>{t("search.signInForDetails")}</span>
            <Link
              to="/auth/signin"
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-bold text-white"
            >
              {t("nav.signIn")}
            </Link>
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-border bg-surface">
                <div className="h-[140px] animate-pulse bg-surface-alt" />
                <div className="flex flex-col gap-2 p-4">
                  <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface-alt" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-surface-alt" />
                  <div className="h-5 w-1/2 animate-pulse rounded bg-surface-alt" />
                </div>
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-danger-soft bg-danger-soft p-6 text-center">
            <p className="font-semibold text-danger">{t("search.error")}</p>
            <button
              onClick={() => refetch()}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-bold text-white"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        {!isLoading &&
          !isError &&
          (authenticated ? (
            properties.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {properties.map((property) => (
                  <PropertyCard key={property.id} property={property} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border-strong px-5 py-8 text-center">
                <p className="font-semibold text-ink">{t("search.noResults")}</p>
              </div>
            )
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {summaries.map((summary) => (
                <li key={summary.id}>
                  <Link
                    to={`/property/${summary.id}`}
                    className="block px-4 py-3 font-medium text-ink hover:bg-surface-alt"
                  >
                    {summary.address}
                  </Link>
                </li>
              ))}
            </ul>
          ))}

        <div className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs font-semibold text-ink-soft">
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
                className="rounded-lg border border-border bg-surface px-2 py-1 text-ink"
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
                className="rounded-lg border border-border bg-surface px-3 py-1.5 font-bold text-ink disabled:opacity-40"
              >
                {t("search.previous")}
              </button>
              <button
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 font-bold text-ink disabled:opacity-40"
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

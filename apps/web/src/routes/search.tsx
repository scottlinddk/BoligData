import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePropertySearch } from "@/hooks/use-property-search";
import { useSavedSearches } from "@/hooks/use-saved-searches";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useMediaQuery } from "@/hooks/use-media-query";
import { parseFilters, serializeFilters, type FiltersWithSort } from "@/lib/url-filters";
import { countActiveFilters } from "@/components/filter-fields";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/constants";
import { FilterSidebar } from "@/components/filter-sidebar";
import { FiltersSheet } from "@/components/filters-sheet";
import { PropertyCard } from "@/components/property-card";
import { LockedPropertyCard } from "@/components/locked-property-card";
import { PropertyMap } from "@/components/property-map";
import { RecommendModal } from "@/components/recommend-modal";
import { useToast } from "@/components/toast";
import { useI18n } from "@/i18n/i18n";

type MobileTab = "list" | "map";

export function SearchPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { showToast } = useToast();
  const { createSearch } = useSavedSearches();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseFilters(searchParams);
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("list");
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState("");
  const [savingSearch, setSavingSearch] = useState(false);
  const canRecommend = profile?.role === "advisor" || profile?.role === "agent";
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recommendOpen, setRecommendOpen] = useState(false);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const { data, isLoading, isError, refetch } = usePropertySearch(filters, offset, pageSize);

  function handleFilterChange(patch: Partial<FiltersWithSort>) {
    setOffset(0);
    setSearchParams(serializeFilters({ ...filters, ...patch }));
  }

  function handlePageSizeChange(size: number) {
    setOffset(0);
    setPageSize(size);
  }

  async function handleSaveSearch() {
    const name = saveSearchName.trim();
    if (!name) return;
    const { sortField: _sortField, sortDirection: _sortDirection, ...propertyFilters } = filters;
    setSavingSearch(true);
    try {
      await createSearch({ name, filters: propertyFilters, alertFrequency: "none" });
      showToast(t("search.saveSearchSuccess"), "success");
      setSaveSearchOpen(false);
      setSaveSearchName("");
    } catch {
      showToast(t("search.saveSearchError"), "error");
    } finally {
      setSavingSearch(false);
    }
  }

  const authenticated = data?.authenticated ?? Boolean(user);
  const properties = data?.properties ?? [];
  const summaries = data?.summaries ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? pageSize;
  const activeFilterCount = countActiveFilters(filters);
  const showMap = authenticated && (!isMobile || mobileTab === "map");
  const showList = !isMobile || mobileTab === "list";
  const mapFullScreen = isMobile && showMap;

  const locationFilterFields = (
    <>
      <input
        type="text"
        value={filters.location ?? ""}
        onChange={(e) => handleFilterChange({ location: e.target.value || null })}
        placeholder={t("filters.locationPlaceholder")}
        className="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink placeholder:text-ink-faint"
      />
      <button
        type="button"
        onClick={() => setFiltersOpen(true)}
        className="relative shrink-0 rounded-full border border-border bg-surface px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest text-ink"
      >
        {t("filters.title")}
        {activeFilterCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-[17px] w-[17px] items-center justify-center rounded-full bg-brand text-[10px] font-bold text-surface">
            {activeFilterCount}
          </span>
        )}
      </button>
    </>
  );

  return (
    <div className="mx-auto flex max-w-[1180px] gap-5 px-4 py-4 md:items-start md:px-5 md:py-7">
      {!isMobile && <FilterSidebar filters={filters} onChange={handleFilterChange} />}

      <div className="flex flex-1 flex-col gap-3.5">
        {isMobile && !mapFullScreen && (
          <div className="flex flex-col gap-2.5">
            <div className="flex gap-2">{locationFilterFields}</div>
            {authenticated && (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setMobileTab("list")}
                  className={`flex-1 rounded-full px-3 py-2 font-mono text-[11px] uppercase tracking-widest ${mobileTab === "list" ? "bg-cta text-cta-text" : "border border-border bg-surface text-ink-soft"}`}
                >
                  {t("search.tabList")}
                </button>
                <button
                  type="button"
                  onClick={() => setMobileTab("map")}
                  className={`flex-1 rounded-full px-3 py-2 font-mono text-[11px] uppercase tracking-widest ${mobileTab === "map" ? "bg-cta text-cta-text" : "border border-border bg-surface text-ink-soft"}`}
                >
                  {t("search.tabMap")}
                </button>
              </div>
            )}
          </div>
        )}

        {!mapFullScreen && canRecommend && (
          <div className="flex flex-wrap items-center gap-2 rounded-[20px] border border-border bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-text">
            <span>{t("recommend.selectHint")}</span>
          </div>
        )}

        {!authenticated && (
          <div className="flex flex-wrap items-center gap-2 rounded-[20px] border border-border bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-text">
            <span>{t("search.signInForDetails")}</span>
            <Link to="/auth/signin" className="rounded-full bg-cta px-3.5 py-1.5 text-xs font-bold text-cta-text">
              {t("nav.signIn")}
            </Link>
          </div>
        )}

        {showMap && !mapFullScreen && (
          <div className="overflow-hidden rounded-[20px] border border-border md:h-72">
            <PropertyMap properties={properties} />
          </div>
        )}

        {mapFullScreen && (
          <div className="fixed inset-x-0 bottom-0 top-[61px] z-30">
            <PropertyMap properties={properties} />

            <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex gap-2">
              <div className="pointer-events-auto flex flex-1 gap-2">{locationFilterFields}</div>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-4">
              <button
                type="button"
                onClick={() => setMobileTab("list")}
                className="pointer-events-auto flex items-center gap-2 rounded-full bg-surface px-5 py-3 text-sm font-bold text-ink shadow-lift"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                {t("search.tabList")}
              </button>
            </div>
          </div>
        )}

        {showList && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <span className="text-[13px] font-semibold text-ink-soft">
                {total > 0
                  ? t("search.range", { from: offset + 1, to: Math.min(offset + limit, total), total })
                  : t("search.noResults")}
              </span>
              {authenticated &&
                (saveSearchOpen ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      autoFocus
                      value={saveSearchName}
                      onChange={(e) => setSaveSearchName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveSearch()}
                      placeholder={t("search.saveSearchNamePlaceholder")}
                      className="min-w-0 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-ink placeholder:text-ink-faint"
                    />
                    <button
                      type="button"
                      disabled={savingSearch || !saveSearchName.trim()}
                      onClick={handleSaveSearch}
                      className="shrink-0 rounded-full bg-cta px-3.5 py-1.5 text-xs font-bold text-cta-text disabled:opacity-40"
                    >
                      {t("search.saveSearchConfirm")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSaveSearchOpen(false);
                        setSaveSearchName("");
                      }}
                      className="shrink-0 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-bold text-ink"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSaveSearchOpen(true)}
                    className="shrink-0 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-bold text-ink"
                  >
                    {t("search.saveSearch")}
                  </button>
                ))}
            </div>

            {isLoading && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="overflow-hidden rounded-[20px] border border-border bg-surface">
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
              <div className="flex flex-col items-center gap-2.5 rounded-[20px] border border-danger-soft bg-danger-soft p-6 text-center animate-pop-in">
                <p className="font-semibold text-danger">{t("search.error")}</p>
                <button onClick={() => refetch()} className="rounded-full bg-danger px-4 py-2 text-sm font-bold text-white">
                  {t("common.retry")}
                </button>
              </div>
            )}

            {!isLoading &&
              !isError &&
              (authenticated ? (
                properties.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                    {properties.map((property) => (
                      <PropertyCard
                        key={property.id}
                        property={property}
                        selectable={canRecommend}
                        selected={selectedIds.has(property.id)}
                        onToggleSelect={toggleSelected}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[20px] border border-dashed border-border-strong px-5 py-8 text-center">
                    <p className="font-semibold text-ink">{t("search.noResults")}</p>
                    <p className="mt-1 text-xs font-medium text-ink-faint">{t("search.noResultsHint")}</p>
                  </div>
                )
              ) : summaries.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                  {summaries.map((summary) => (
                    <LockedPropertyCard key={summary.id} summary={summary} />
                  ))}
                </div>
              ) : (
                <div className="rounded-[20px] border border-dashed border-border-strong px-5 py-8 text-center">
                  <p className="font-semibold text-ink">{t("search.noResults")}</p>
                </div>
              ))}

            <div className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs font-semibold text-ink-soft">
              <span>
                {total > 0
                  ? t("search.range", { from: offset + 1, to: Math.min(offset + limit, total), total })
                  : t("search.noResults")}
              </span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2">
                  {t("search.pageSize")}
                  <select
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    className="rounded-full border border-border bg-surface px-2.5 py-1 text-ink"
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
                    className="rounded-full border border-border bg-surface px-3.5 py-1.5 font-bold text-ink disabled:opacity-40"
                  >
                    {t("search.previous")}
                  </button>
                  <button
                    disabled={offset + limit >= total}
                    onClick={() => setOffset(offset + limit)}
                    className="rounded-full border border-border bg-surface px-3.5 py-1.5 font-bold text-ink disabled:opacity-40"
                  >
                    {t("search.next")}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {filtersOpen && (
        <FiltersSheet filters={filters} onChange={handleFilterChange} onClose={() => setFiltersOpen(false)} />
      )}

      {canRecommend && selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-2.5 shadow-lift">
            <span className="text-sm font-bold text-ink">{t("recommend.selectedCount", { count: selectedIds.size })}</span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-bold text-ink"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => setRecommendOpen(true)}
              className="rounded-full bg-cta px-3.5 py-1.5 text-xs font-bold text-cta-text"
            >
              {t("recommend.cta")}
            </button>
          </div>
        </div>
      )}

      {recommendOpen && (
        <RecommendModal
          propertyIds={Array.from(selectedIds)}
          propertyCount={selectedIds.size}
          onClose={() => setRecommendOpen(false)}
          onSent={() => setSelectedIds(new Set())}
        />
      )}
    </div>
  );
}

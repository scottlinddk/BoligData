import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePropertySearch } from "@/hooks/use-property-search";
import { useSavedSearches } from "@/hooks/use-saved-searches";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useMediaQuery } from "@/hooks/use-media-query";
import { parseFilters, serializeFilters, type FiltersWithSort } from "@/lib/url-filters";
import { countActiveFilters } from "@/components/filter-fields";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, PROPERTY_TYPE_OPTIONS, SORT_OPTIONS } from "@/lib/constants";
import { FiltersSheet } from "@/components/filters-sheet";
import { PropertyCard } from "@/components/property-card";
import { PropertyCardSkeleton } from "@/components/ui/loading";
import { LockedPropertyCard } from "@/components/locked-property-card";
import { PropertyMap } from "@/components/property-map";
import { Footer } from "@/components/footer";
import { RecommendModal } from "@/components/recommend-modal";
import { useToast } from "@/components/toast";
import { useI18n } from "@/i18n/i18n";
import type { PropertyType } from "@shared/types/index";

const pill = "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink transition hover:border-border-strong hover:bg-surface-alt";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-cta px-5 py-2.5 text-sm font-semibold text-cta-text transition hover:bg-cta-hover disabled:opacity-40";
function ViewIcon({ map }: { map: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">{map ? <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /> : <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}</svg>;
}

export function SearchPage() {
  const { t, language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { showToast } = useToast();
  const { createSearch } = useSavedSearches();
  const isMobile = useMediaQuery("(max-width: 899px)");
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const resultsRef = useRef<HTMLElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"list" | "map">("list");
  const [desktopMap, setDesktopMap] = useState(true);
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState("");
  const [savingSearch, setSavingSearch] = useState(false);
  const canRecommend = profile?.role === "advisor" || profile?.role === "agent";
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recommendOpen, setRecommendOpen] = useState(false);
  // Browser back/forward and saved-search links can change the search too.
  useEffect(() => { setOffset(0); setSelectedIds(new Set()); }, [searchParams]);
  const { data, isLoading, isFetching, isError, error, refetch } = usePropertySearch(filters, offset, pageSize);
  const authenticated = data?.authenticated ?? Boolean(user);
  const properties = data?.properties ?? [];
  const summaries = data?.summaries ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? pageSize;
  const activeFilterCount = countActiveFilters(filters);
  const showMap = authenticated && (isMobile ? mobileTab === "map" : desktopMap);
  const showList = !isMobile || mobileTab === "list";

  function handleFilterChange(patch: Partial<FiltersWithSort>) {
    setOffset(0);
    setSearchParams(serializeFilters({ ...filters, ...patch }));
  }
  function toggleSelected(id: string) {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function goToPage(nextOffset: number) {
    setOffset(nextOffset);
    resultsRef.current?.focus({ preventScroll: true });
    resultsRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? "instant" : "smooth", block: "start" });
  }
  async function handleSaveSearch() {
    const name = saveSearchName.trim();
    if (!name || savingSearch) return;
    const { sortField: _sortField, sortDirection: _sortDirection, ...propertyFilters } = filters;
    setSavingSearch(true);
    try {
      await createSearch({ name, filters: propertyFilters, alertFrequency: "none" });
      showToast(t("search.saveSearchSuccess"), "success"); setSaveSearchOpen(false); setSaveSearchName("");
    } catch { showToast(t("search.saveSearchError"), "error"); }
    finally { setSavingSearch(false); }
  }
  const displayedOffset = data?.offset ?? offset;
  const range = isLoading ? t("search.loading") : !data ? "" : total > 0 ? t("search.range", { from: displayedOffset + 1, to: Math.min(displayedOffset + limit, total), total }) : t("search.noResults");
  const grid = `grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 ${!showMap ? "xl:grid-cols-3" : "min-[900px]:grid-cols-1 min-[1100px]:grid-cols-2"}`;
  const title = filters.location ? tx(`Boliger til salg i ${filters.location}`, `Homes for sale in ${filters.location}`) : filters.polygon ? tx("Boliger i dit markerede område", "Homes in your drawn area") : tx("Find dit næste hjem", "Find your next home");
  const mapSelected = isMobile ? mobileTab === "map" : desktopMap;
  const viewToggle = authenticated && <div className="flex shrink-0 rounded-full border border-border bg-surface p-1" aria-label={tx("Visning af boliger", "Listing view")}>
    <button aria-label={t("search.tabList")} aria-pressed={!mapSelected} onClick={() => isMobile ? setMobileTab("list") : setDesktopMap(false)} className={`flex h-9 w-10 items-center justify-center rounded-full transition ${!mapSelected ? "bg-cta text-cta-text" : "text-ink-soft hover:bg-surface-alt"}`}><ViewIcon map={false} /></button>
    <button aria-label={t("search.tabMap")} aria-pressed={mapSelected} onClick={() => isMobile ? setMobileTab("map") : setDesktopMap(true)} className={`flex h-9 w-10 items-center justify-center rounded-full transition ${mapSelected ? "bg-cta text-cta-text" : "text-ink-soft hover:bg-surface-alt"}`}><ViewIcon map /></button>
  </div>;

  return <>
    <div className="mx-auto max-w-[1480px] px-4 pb-16 pt-8 sm:px-7 sm:pt-12 lg:px-10">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-5 sm:mb-9">
        <div className="max-w-3xl">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-ink-soft">{tx("Boliger til salg", "Homes for sale")}</p>
          <h1 className="text-[34px] font-medium leading-[1.1] tracking-[-0.045em] text-ink sm:text-[46px]">{filters.location || filters.polygon ? title : <>{tx("Find dit næste", "Find your next")} <span className="font-serif font-normal italic">{tx("hjem", "home")}</span></>}</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">{tx("Gå på opdagelse i boligerne. Få overblik over priser, historik og området.", "Explore the homes. Get a clear view of prices, history and the neighbourhood.")}</p>
        </div>
        {authenticated && <button onClick={() => setSaveSearchOpen(v => !v)} disabled={savingSearch} className={`${pill} disabled:cursor-wait disabled:opacity-50`} aria-expanded={saveSearchOpen}><span aria-hidden="true">♡</span>{t("search.saveSearch")}</button>}
      </div>
      <div className="mb-8 rounded-[22px] bg-surface-alt p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2.5" role="search">
          <label className="relative min-w-[180px] flex-[1_1_220px]">
            <span className="sr-only">{t("filters.location")}</span>
            <input type="search" value={filters.location ?? ""} onChange={e => handleFilterChange({ location: e.target.value || null })} placeholder={tx("By, postnummer eller adresse", "City, postcode or address")} className="h-12 w-full rounded-full border border-border bg-surface py-2 pl-11 pr-4 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-soft" />
            <svg className="pointer-events-none absolute left-4 top-4 text-ink-soft" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.7" /><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
          </label>
          <select aria-label={t("filters.propertyType")} className={`${pill} h-12 min-w-0 max-w-44 flex-1 pr-7 sm:flex-none`} value={filters.propertyTypes && filters.propertyTypes.length > 1 ? "multiple" : filters.propertyTypes?.[0] ?? ""} onChange={e => handleFilterChange({ propertyTypes: e.target.value ? [e.target.value as PropertyType] : null })}>
            <option value="">{t("filters.propertyType")}</option>
            {filters.propertyTypes && filters.propertyTypes.length > 1 && <option value="multiple">{tx("Flere boligtyper", "Multiple types")}</option>}
            {PROPERTY_TYPE_OPTIONS.map(value => <option key={value} value={value}>{t(`propertyType.${value}`)}</option>)}
          </select>
          <button className={`${pill} h-12`} onClick={() => setFiltersOpen(true)} aria-label={tx("Filtre", "Filters")} aria-haspopup="dialog"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" className="fill-surface" /><circle cx="15" cy="17" r="3" className="fill-surface" /></svg><span className="hidden sm:inline">{tx("Filtre", "Filters")}</span>{activeFilterCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-soft px-1 text-xs text-brand-text">{activeFilterCount}</span>}</button>
          {viewToggle}
        </div>
        {filters.polygon && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-brand-soft px-3 py-1.5 font-medium text-brand-text">{tx("Søger i markeret område", "Searching your drawn area")}</span><button className="text-ink-soft underline underline-offset-2 hover:text-ink" onClick={() => handleFilterChange({ polygon: null })}>{tx("Fjern afgrænsning", "Remove boundary")} ×</button></div>}
        {saveSearchOpen && <form className="ui-enter mt-4 flex flex-wrap gap-2 border-t border-border pt-4" onSubmit={e => { e.preventDefault(); void handleSaveSearch(); }}><input aria-label={t("search.saveSearchNamePlaceholder")} autoFocus disabled={savingSearch} value={saveSearchName} onChange={e => setSaveSearchName(e.target.value)} placeholder={t("search.saveSearchNamePlaceholder")} className="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm disabled:opacity-50" /><button className={primary} aria-busy={savingSearch} disabled={savingSearch || !saveSearchName.trim()}>{savingSearch && <span className="ui-spinner h-4 w-4" aria-hidden="true" />}{savingSearch ? t("common.saving") : t("search.saveSearchConfirm")}</button><button type="button" disabled={savingSearch} onClick={() => setSaveSearchOpen(false)} className={`${pill} disabled:opacity-50`}>{t("common.cancel")}</button>{filters.polygon && <p className="w-full text-xs text-ink-soft">{tx("Det markerede område gemmes sammen med filtrene.", "The drawn area will be saved with your filters.")}</p>}</form>}
      </div>
      <div className={showMap && !isMobile ? "grid items-start gap-7 min-[900px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:gap-9" : ""}>
        <section ref={resultsRef} tabIndex={-1} className="min-w-0 scroll-mt-24 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand" aria-label={tx("Boligsøgning", "Property search")}>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs text-ink-soft">
            <span role="status" aria-atomic="true" className="inline-flex min-h-6 items-center gap-2">{isFetching && <span className="ui-spinner h-3.5 w-3.5" aria-hidden="true" />}{isFetching ? data ? tx("Opdaterer boliger…", "Updating homes…") : t("search.loading") : isError && !data ? tx("Boligerne kunne ikke indlæses", "Homes could not be loaded") : tx(`${total.toLocaleString("da-DK")} boliger`, `${total.toLocaleString("en-GB")} homes`)}</span>
            <label className="flex min-w-0 items-center gap-1.5">{t("filters.sortBy")}<select aria-label={t("filters.sortBy")} value={`${filters.sortField}:${filters.sortDirection}`} onChange={e => { const [sortField, sortDirection] = e.target.value.split(":"); handleFilterChange({ sortField: sortField as FiltersWithSort["sortField"], sortDirection: sortDirection as FiltersWithSort["sortDirection"] }); }} className="max-w-44 bg-transparent py-1 font-medium text-ink focus:outline-brand">{SORT_OPTIONS.map(value => <option value={value} key={value}>{t(`sort.${value}`)}</option>)}</select></label>
          </div>
        {canRecommend && <p className="mb-5 rounded-xl bg-brand-soft p-3 text-sm text-brand-text">{t("recommend.selectHint")}</p>}
        {!authenticated && <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-brand-soft p-4 text-sm text-brand-text"><p className="flex-1">{t("search.signInForDetails")}</p><Link to="/auth/signin" className={primary}>{t("nav.signIn")}</Link></div>}
        {isError && <div role="alert" className="ui-enter mb-5 rounded-xl border border-danger-soft bg-danger-soft p-5"><p className="font-medium text-danger">{t("search.error")}</p>{filters.polygon && <p className="mt-1 text-sm text-ink-soft">{error?.message}</p>}<button disabled={isFetching} onClick={() => refetch()} className={`${pill} mt-3 disabled:opacity-50`}>{isFetching && <span className="ui-spinner h-4 w-4" aria-hidden="true" />}{t("common.retry")}</button></div>}
        {showList && <div aria-busy={isFetching}>
          {isLoading && <div className={grid} aria-hidden="true">{Array.from({ length: 6 }).map((_, i) => <PropertyCardSkeleton key={i} />)}</div>}
          {!isLoading && data && <div className={`transition-opacity duration-200 motion-reduce:transition-none ${isFetching ? "opacity-60" : "opacity-100"}`}>{authenticated ? properties.length > 0 ? <div key={`${displayedOffset}-${limit}`} className={`${grid} ui-fade-in`} data-testid="property-results">{properties.map(property => <PropertyCard key={property.id} property={property} selectable={canRecommend} selected={selectedIds.has(property.id)} onToggleSelect={toggleSelected} />)}</div> : <div className="ui-enter rounded-xl border border-dashed border-border-strong px-5 py-10 text-center"><p className="font-semibold">{t("search.noResults")}</p><p className="mt-2 text-sm text-ink-soft">{filters.polygon ? tx("Udvid området på kortet, eller justér dine filtre.", "Expand the map boundary or adjust your filters.") : t("search.noResultsHint")}</p></div> : summaries.length > 0 ? <div key={`${displayedOffset}-${limit}`} className={`${grid} ui-fade-in`}>{summaries.map(summary => <LockedPropertyCard key={summary.id} summary={summary} />)}</div> : <p className="ui-enter py-8 text-center text-ink-soft">{t("search.noResults")}</p>}</div>}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-xs text-ink-soft"><span>{range}</span><div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2">{t("search.pageSize")}<select value={pageSize} disabled={isFetching} onChange={e => { goToPage(0); setPageSize(Number(e.target.value)); }} className="rounded-lg border border-border bg-surface p-1.5 text-ink disabled:opacity-50">{PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}</select></label><div className="flex gap-1.5"><button disabled={offset === 0 || isFetching} onClick={() => goToPage(Math.max(0, offset - limit))} className="rounded-full border border-border px-3 py-2 text-ink disabled:opacity-40">{t("search.previous")}</button><button disabled={offset + limit >= total || isFetching} onClick={() => goToPage(offset + limit)} className="rounded-full border border-border px-3 py-2 text-ink disabled:opacity-40">{t("search.next")}</button></div></div></div>
        </div>}
        </section>
        {showMap && <aside aria-label={tx("Kort over boliger", "Map of homes")} className={`overflow-hidden rounded-[22px] border border-border ${isMobile ? "relative h-[68dvh] min-h-[430px]" : "sticky top-20 h-[calc(100dvh-7rem)] min-h-[500px] max-h-[900px] self-start"}`}>
          <PropertyMap properties={properties} filters={filters} onBoundaryChange={polygon => handleFilterChange({ polygon })} onShowList={isMobile ? () => setMobileTab("list") : undefined} listTotal={data ? total : undefined} />
        </aside>}
      </div>
    </div>
    <Footer />
    {filtersOpen && <FiltersSheet filters={filters} onChange={handleFilterChange} onClose={() => setFiltersOpen(false)} />}
    {canRecommend && selectedIds.size > 0 && <div className="ui-enter fixed inset-x-0 bottom-5 z-40 flex justify-center px-4"><div className="flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-2.5 shadow-lift"><span className="text-sm font-semibold">{t("recommend.selectedCount", { count: selectedIds.size })}</span><button onClick={() => setSelectedIds(new Set())} className={pill}>{t("common.cancel")}</button><button onClick={() => setRecommendOpen(true)} className={primary}>{t("recommend.cta")}</button></div></div>}
    {recommendOpen && <RecommendModal propertyIds={Array.from(selectedIds)} propertyCount={selectedIds.size} onClose={() => setRecommendOpen(false)} onSent={() => setSelectedIds(new Set())} />}
  </>;
}

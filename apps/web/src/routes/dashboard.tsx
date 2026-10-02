import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSavedSearches } from "@/hooks/use-saved-searches";
import { useSavedProperties } from "@/hooks/use-saved-properties";
import { useNotifications } from "@/hooks/use-notifications";
import { listMyConnections } from "@/lib/api";
import { serializeFilters } from "@/lib/url-filters";
import { ConnectionList } from "@/components/connection-list";
import { LoadingStatus, PropertyCardSkeleton, Skeleton } from "@/components/ui/loading";
import { useToast } from "@/components/toast";
import {
  DashboardWorkspace,
  WorkspaceEmpty,
  WorkspaceNavButton,
  WorkspacePropertyCard,
  WorkspacePropertyPreview,
  WorkspaceSection,
  WorkspaceStat,
} from "@/components/dashboard/workspace";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import type { AlertFrequency } from "@shared/types/index";
import { formatDkk } from "@shared/utils/price";

const ALERT_OPTIONS: { value: AlertFrequency; labelKey: TranslationKey }[] = [
  { value: "none", labelKey: "alerts.none" },
  { value: "immediate", labelKey: "alerts.immediate" },
  { value: "daily", labelKey: "alerts.daily" },
  { value: "weekly", labelKey: "alerts.weekly" },
];

type FavoriteSort = "saved" | "price-asc" | "price-desc" | "area-desc";
const fieldClass = "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink";
const linkClass = "inline-flex items-center justify-center rounded-full bg-cta px-4 py-2.5 text-sm font-semibold text-cta-text transition hover:bg-cta-hover";

export function DashboardPage() {
  const { t, language } = useI18n();
  const da = language === "da";
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { searches, isLoading: searchesLoading, isError: searchesError, updateAlert } = useSavedSearches();
  const { properties: favoriteProperties, isLoading: favoritesLoading, isError: favoritesError } = useSavedProperties();
  const [view, setView] = useState<"favorites" | "searches">("favorites");
  const [favoriteQuery, setFavoriteQuery] = useState("");
  const [sort, setSort] = useState<FavoriteSort>("saved");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const { notifications, isLoading: notificationsLoading, isError: notificationsError, markAllRead } = useNotifications({ unreadOnly: true });
  const connectionsQuery = useQuery({ queryKey: ["connections", "mine"], queryFn: listMyConnections });
  const myProfessionals = (connectionsQuery.data?.connections ?? []).filter((c) => c.direction === "professional");
  const dateLocale = da ? "da-DK" : "en-GB";
  const query = favoriteQuery.trim().toLocaleLowerCase(dateLocale);
  const visibleProperties = favoriteProperties.filter((property) =>
    `${property.address} ${property.municipality} ${property.postalCode ?? ""}`.toLocaleLowerCase(dateLocale).includes(query),
  );
  if (sort === "price-asc") visibleProperties.sort((a, b) => a.price - b.price);
  if (sort === "price-desc") visibleProperties.sort((a, b) => b.price - a.price);
  if (sort === "area-desc") visibleProperties.sort((a, b) => b.sqm - a.sqm);
  const selectedProperty = visibleProperties.find((property) => property.id === selectedId) ?? visibleProperties[0];
  const latestNotification = notifications[0];

  async function handleAlertChange(searchId: string, alertFrequency: AlertFrequency) {
    setPendingId(searchId);
    try {
      await updateAlert({ searchId, body: { alertFrequency } });
      showToast(da ? "Beskedfrekvens opdateret." : "Alert frequency updated.", "success");
    } catch {
      showToast(da ? "Beskedfrekvensen kunne ikke gemmes. Prøv igen." : "Could not save the alert frequency. Please try again.", "error");
    } finally {
      setPendingId(null);
    }
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      await markAllRead();
    } catch {
      showToast(da ? "Beskederne kunne ikke markeres som læst. Prøv igen." : "Could not mark notifications as read. Please try again.", "error");
    } finally {
      setMarkingAll(false);
    }
  }

  const retry = (queryKey: string[]) => (
    <button type="button" onClick={() => void queryClient.invalidateQueries({ queryKey })} className="mt-3 text-sm font-semibold text-brand-text hover:underline">
      {t("common.retry")}
    </button>
  );

  return (
    <DashboardWorkspace
      title={t("dashboard.heading")}
      description={da ? "Dine gemte boliger, søgninger og kontakter. Samlet ét sted." : "Your saved properties, searches and contacts. All in one place."}
      actions={<Link to="/" className={linkClass}>{da ? "Find flere boliger" : "Find more properties"}<span aria-hidden="true" className="ml-2">↗</span></Link>}
      sidebar={
        <>
          <WorkspaceSection title={da ? "Mit overblik" : "My overview"}>
            <div className="space-y-1.5">
              <WorkspaceNavButton active={view === "favorites"} onClick={() => setView("favorites")} count={favoritesLoading || favoritesError ? undefined : favoriteProperties.length}>{t("dashboard.favoritesTitle")}</WorkspaceNavButton>
              <WorkspaceNavButton active={view === "searches"} onClick={() => setView("searches")} count={searchesLoading || searchesError ? undefined : searches.length}>{t("dashboard.title")}</WorkspaceNavButton>
            </div>
          </WorkspaceSection>
          {view === "favorites" ? (
            <WorkspaceSection title={t("filters.title")}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="favorite-search" className="mb-2 block text-xs font-medium text-ink-soft">{da ? "Søg i gemte boliger" : "Search saved properties"}</label>
                  <input id="favorite-search" type="search" value={favoriteQuery} onChange={(event) => setFavoriteQuery(event.target.value)} placeholder={da ? "Adresse, by eller postnummer" : "Address, city or postal code"} className={fieldClass} />
                </div>
                <div>
                  <label htmlFor="favorite-sort" className="mb-2 block text-xs font-medium text-ink-soft">{da ? "Sortér boliger" : "Sort properties"}</label>
                  <select id="favorite-sort" value={sort} onChange={(event) => setSort(event.target.value as FavoriteSort)} className={fieldClass}>
                    <option value="saved">{da ? "Senest gemte" : "Recently saved"}</option>
                    <option value="price-asc">{da ? "Laveste pris" : "Lowest price"}</option>
                    <option value="price-desc">{da ? "Højeste pris" : "Highest price"}</option>
                    <option value="area-desc">{da ? "Største boliger" : "Largest properties"}</option>
                  </select>
                </div>
                {(favoriteQuery || sort !== "saved") && <button type="button" onClick={() => { setFavoriteQuery(""); setSort("saved"); }} className="text-xs font-semibold text-brand-text hover:underline">{t("filters.reset")}</button>}
              </div>
            </WorkspaceSection>
          ) : (
            <WorkspaceSection title={da ? "Følg markedet" : "Follow the market"}>
              <p className="text-sm leading-6 text-ink-soft">{da ? "Åbn en gemt søgning for at se de seneste boliger. Vælg, hvor ofte du vil modtage beskeder om nye match." : "Open a saved search to see the latest properties. Choose how often you receive alerts about new matches."}</p>
              <Link to="/" className="mt-4 inline-flex text-sm font-semibold text-brand-text hover:underline">{da ? "Opret en søgning" : "Create a search"}<span aria-hidden="true" className="ml-2">↗</span></Link>
            </WorkspaceSection>
          )}
          <WorkspaceSection title={da ? "Din aktivitet" : "Your activity"}>
            <dl className="grid grid-cols-2 gap-2">
              <WorkspaceStat label={da ? "Ulæste beskeder" : "Unread alerts"} value={notificationsLoading || notificationsError ? "—" : notifications.length} />
              <WorkspaceStat label={da ? "Kontakter" : "Contacts"} value={connectionsQuery.isLoading || connectionsQuery.isError ? "—" : myProfessionals.length} />
            </dl>
          </WorkspaceSection>
        </>
      }
      detail={
        <div className="space-y-6">
          {view === "favorites" && (
            selectedProperty ? <WorkspacePropertyPreview property={selectedProperty} /> : (
              <WorkspaceSection title={da ? "Boligoverblik" : "Property preview"}>
                <p className="text-sm leading-6 text-ink-soft">{da ? "Vælg en gemt bolig for at se flere detaljer her." : "Choose a saved property to see more details here."}</p>
              </WorkspaceSection>
            )
          )}
          <WorkspaceSection title={t("notifications.title")}>
            {notificationsLoading ? <LoadingStatus>{t("dashboard.loading")}</LoadingStatus> : notificationsError ? (
              <div role="alert" className="text-sm text-ink-soft">{da ? "Beskederne kunne ikke indlæses." : "Could not load notifications."}{retry(["notifications"])}</div>
            ) : latestNotification ? (
              <>
                <p className="text-sm leading-6 text-ink-soft">{t(notifications.length === 1 ? "notifications.summaryOne" : "notifications.summary", { count: notifications.length, date: new Date(latestNotification.createdAt).toLocaleDateString(dateLocale) })}</p>
                {latestNotification.title && <p className="mt-3 rounded-xl bg-surface-alt p-3 text-sm font-medium text-ink">{latestNotification.title}</p>}
                <button type="button" onClick={() => void handleMarkAllRead()} disabled={markingAll} aria-busy={markingAll} className="mt-3 text-xs font-semibold text-brand-text hover:underline disabled:opacity-50">{markingAll ? t("dashboard.loading") : t("notifications.markAllRead")}</button>
              </>
            ) : <p className="text-sm text-ink-soft">{t("notifications.empty")}</p>}
            <Link to="/account/notifications" className="mt-4 block text-xs font-semibold text-brand-text hover:underline">{da ? "Se alle beskeder" : "View all notifications"} <span aria-hidden="true">↗</span></Link>
          </WorkspaceSection>
          <div className="border-t border-border pt-6 [&_a]:shrink-0 [&_li>div]:min-w-0 [&_li>div]:max-w-full [&_li>div]:break-words [&_li>div>div:first-child]:block [&_li>div>div:first-child]:break-all [&_li>div>div:first-child>span]:ml-1.5 [&_li>div>div:first-child>span]:inline-block">
            {connectionsQuery.isLoading ? <LoadingStatus>{da ? "Indlæser kontakter..." : "Loading contacts..."}</LoadingStatus> : connectionsQuery.isError ? (
              <div role="alert" className="text-sm text-ink-soft">{da ? "Dine kontakter kunne ikke indlæses." : "Could not load your contacts."}{retry(["connections", "mine"])}</div>
            ) : <ConnectionList connections={myProfessionals} titleKey="connections.myProfessionals.title" emptyKey="connections.myProfessionals.empty" />}
          </div>
        </div>
      }
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">{t(view === "favorites" ? "dashboard.favoritesTitle" : "dashboard.title")}</h2>
          <p className="mt-1 text-sm text-ink-soft">{view === "favorites" ? (da ? "Hold styr på de boliger, du vil se nærmere på." : "Keep track of the properties you want to explore.") : (da ? "Dine kriterier. Nye muligheder." : "Your criteria. New opportunities.")}</p>
        </div>
        {view === "favorites" && !favoritesLoading && !favoritesError && <span role="status" className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft">{da ? `${visibleProperties.length} af ${favoriteProperties.length} boliger` : `${visibleProperties.length} of ${favoriteProperties.length} properties`}</span>}
      </div>

      {view === "favorites" ? (
        favoritesLoading ? (
          <><LoadingStatus className="mb-4">{t("dashboard.loading")}</LoadingStatus><div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <PropertyCardSkeleton key={index} />)}</div></>
        ) : favoritesError ? (
          <WorkspaceEmpty title={da ? "Boligerne kunne ikke indlæses" : "Could not load saved properties"} description={da ? "Prøv at hente dine gemte boliger igen." : "Try loading your saved properties again."} action={retry(["favorites"])} />
        ) : favoriteProperties.length === 0 ? (
          <WorkspaceEmpty title={da ? "Dine favoritter starter her" : "Your favorites start here"} description={t("dashboard.favoritesEmpty")} action={<Link to="/" className={linkClass}>{da ? "Udforsk boliger" : "Explore properties"}</Link>} />
        ) : visibleProperties.length === 0 ? (
          <WorkspaceEmpty title={da ? "Ingen boliger matcher" : "No matching properties"} description={da ? "Prøv en anden adresse, by eller et andet postnummer." : "Try another address, city or postal code."} action={<button type="button" onClick={() => setFavoriteQuery("")} className={linkClass}>{da ? "Vis alle gemte boliger" : "Show all saved properties"}</button>} />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {visibleProperties.map((property) => <WorkspacePropertyCard key={property.id} property={property} active={selectedProperty?.id === property.id} onPreview={() => setSelectedId(property.id)} />)}
          </div>
        )
      ) : searchesLoading ? (
        <><LoadingStatus className="mb-4">{t("dashboard.loading")}</LoadingStatus><div className="space-y-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-36 rounded-2xl" />)}</div></>
      ) : searchesError ? (
        <WorkspaceEmpty title={da ? "Søgningerne kunne ikke indlæses" : "Could not load saved searches"} description={da ? "Prøv at hente dine gemte søgninger igen." : "Try loading your saved searches again."} action={retry(["searches"])} />
      ) : searches.length === 0 ? (
        <WorkspaceEmpty title={t("dashboard.title")} description={t("dashboard.empty")} action={<Link to="/" className={linkClass}>{da ? "Find og gem en søgning" : "Find and save a search"}</Link>} />
      ) : (
        <ul className="space-y-4">
          {searches.map((search) => (
            <li key={search.id} className="rounded-2xl border border-border bg-surface p-5">
              <Link to={`/?${serializeFilters(search.filters)}`} className="group block">
                <div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-ink group-hover:text-brand-text">{search.name}</h3><span aria-hidden="true" className="text-brand-text">↗</span></div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-soft">
                  {(search.filters.location || search.filters.postnummer) && <span className="rounded-full bg-surface-alt px-2.5 py-1.5">{[search.filters.location, search.filters.postnummer].filter(Boolean).join(" · ")}</span>}
                  {search.filters.minPrice != null && <span className="rounded-full bg-surface-alt px-2.5 py-1.5">{da ? "Fra" : "From"} {formatDkk(search.filters.minPrice)}</span>}
                  {search.filters.maxPrice != null && <span className="rounded-full bg-surface-alt px-2.5 py-1.5">{da ? "Op til" : "Up to"} {formatDkk(search.filters.maxPrice)}</span>}
                  {search.filters.propertyTypes?.map((type) => <span key={type} className="rounded-full bg-surface-alt px-2.5 py-1.5">{t(`propertyType.${type}`)}</span>)}
                </div>
              </Link>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-xs text-ink-soft">{t("dashboard.lastAlert", { date: search.lastAlertAt ? new Date(search.lastAlertAt).toLocaleDateString(dateLocale) : t("dashboard.never") })}</p>
                <div className="flex items-center gap-2">
                  <label htmlFor={`search-alert-${search.id}`} className="text-xs text-ink-soft">{da ? "Beskeder" : "Alerts"}</label>
                  <select id={`search-alert-${search.id}`} aria-label={da ? `Beskedfrekvens for ${search.name}` : `Alert frequency for ${search.name}`} value={search.alertFrequency} disabled={pendingId !== null} aria-busy={pendingId === search.id} onChange={(event) => void handleAlertChange(search.id, event.target.value as AlertFrequency)} className="rounded-lg border border-border bg-paper px-2 py-2 text-xs text-ink disabled:opacity-50">
                    {ALERT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
                  </select>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardWorkspace>
  );
}

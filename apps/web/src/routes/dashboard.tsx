import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSavedSearches } from "@/hooks/use-saved-searches";
import { useSavedProperties } from "@/hooks/use-saved-properties";
import { listNotifications, markNotificationRead } from "@/lib/api";
import { serializeFilters } from "@/lib/url-filters";
import { PropertyCard } from "@/components/property-card";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import type { AlertFrequency } from "@shared/types/index";

const ALERT_OPTIONS: { value: AlertFrequency; labelKey: TranslationKey }[] = [
  { value: "none", labelKey: "alerts.none" },
  { value: "immediate", labelKey: "alerts.immediate" },
  { value: "daily", labelKey: "alerts.daily" },
  { value: "weekly", labelKey: "alerts.weekly" },
];

export function DashboardPage() {
  const { t, language } = useI18n();
  const { searches, isLoading, updateAlert } = useSavedSearches();
  const { properties: favoriteProperties, isLoading: favoritesLoading } = useSavedProperties();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const notificationsQuery = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => listNotifications(true),
  });
  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const notifications = notificationsQuery.data?.notifications ?? [];

  const dateLocale = language === "da" ? "da-DK" : "en-GB";

  async function handleAlertChange(searchId: string, alertFrequency: AlertFrequency) {
    setPendingId(searchId);
    try {
      await updateAlert({ searchId, body: { alertFrequency } });
    } finally {
      setPendingId(null);
    }
  }

  async function handleMarkAllRead() {
    await Promise.all(notifications.map((n) => markReadMutation.mutateAsync(n.id)));
  }

  const latestNotification = notifications[0] ?? null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-3xl font-bold tracking-tight text-ink">{t("dashboard.heading")}</h1>

      <div className="mb-8">
        <h2 className="mb-2 font-semibold text-ink-soft">{t("dashboard.favoritesTitle")}</h2>
        {favoritesLoading && <p className="font-semibold text-ink-soft">{t("dashboard.loading")}</p>}
        {!favoritesLoading && favoriteProperties.length === 0 && (
          <p className="font-semibold text-ink-soft">{t("dashboard.favoritesEmpty")}</p>
        )}
        {favoriteProperties.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {favoriteProperties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 font-semibold text-ink-soft">{t("dashboard.title")}</h2>

        {isLoading && <p className="font-semibold text-ink-soft">{t("dashboard.loading")}</p>}
        {!isLoading && searches.length === 0 && (
          <p className="font-semibold text-ink-soft">{t("dashboard.empty")}</p>
        )}

        <ul className="flex flex-col gap-3">
          {searches.map((search) => (
            <li
              key={search.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-surface p-4"
            >
              <Link
                to={`/?${serializeFilters(search.filters)}`}
                className="min-w-0 flex-1 hover:opacity-80"
              >
                <div className="font-bold text-ink">{search.name}</div>
                <div className="mt-0.5 text-xs font-semibold text-ink-soft">
                  {t("dashboard.lastAlert", {
                    date: search.lastAlertAt
                      ? new Date(search.lastAlertAt).toLocaleDateString(dateLocale)
                      : t("dashboard.never"),
                  })}
                </div>
              </Link>
              <select
                value={search.alertFrequency}
                disabled={pendingId === search.id}
                onChange={(e) => handleAlertChange(search.id, e.target.value as AlertFrequency)}
                className="ml-3 shrink-0 rounded-lg border border-border bg-paper px-2 py-1 text-sm text-ink"
              >
                {ALERT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </div>

      {notifications.length > 0 && latestNotification && (
        <div className="mt-8 flex items-center justify-between rounded-2xl border border-border bg-surface p-4">
          <div>
            <h2 className="font-semibold text-ink-soft">{t("notifications.title")}</h2>
            <p className="mt-0.5 text-sm font-semibold text-ink">
              {t(notifications.length === 1 ? "notifications.summaryOne" : "notifications.summary", {
                count: notifications.length,
                date: new Date(latestNotification.createdAt).toLocaleDateString(dateLocale),
              })}
            </p>
          </div>
          <button
            onClick={handleMarkAllRead}
            disabled={markReadMutation.isPending}
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm font-bold text-ink"
          >
            {t("notifications.markAllRead")}
          </button>
        </div>
      )}
    </div>
  );
}

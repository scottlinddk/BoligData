import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSavedSearches } from "@/hooks/use-saved-searches";
import { listNotifications, markNotificationRead } from "@/lib/api";
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {notifications.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 font-semibold text-ink-soft">{t("notifications.title")}</h2>
          <ul className="flex flex-col gap-2">
            {notifications.map((n) => (
              <li
                key={n.id}
                className="flex items-center justify-between rounded-xl border border-border bg-surface p-3"
              >
                <span className="text-sm font-semibold text-ink">
                  {new Date(n.createdAt).toLocaleDateString(dateLocale)}
                </span>
                <button
                  onClick={() => markReadMutation.mutate(n.id)}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-bold text-ink"
                >
                  {t("notifications.markRead")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h1 className="mb-4 font-serif text-3xl italic text-ink">{t("dashboard.title")}</h1>

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
            <div>
              <div className="font-bold text-ink">{search.name}</div>
              <div className="mt-0.5 text-xs font-semibold text-ink-soft">
                {t("dashboard.lastAlert", {
                  date: search.lastAlertAt
                    ? new Date(search.lastAlertAt).toLocaleDateString(dateLocale)
                    : t("dashboard.never"),
                })}
              </div>
            </div>
            <select
              value={search.alertFrequency}
              disabled={pendingId === search.id}
              onChange={(e) => handleAlertChange(search.id, e.target.value as AlertFrequency)}
              className="rounded-lg border border-border bg-paper px-2 py-1 text-sm text-ink"
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
  );
}

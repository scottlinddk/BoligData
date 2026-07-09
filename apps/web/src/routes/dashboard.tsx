import { useState } from "react";
import { useSavedSearches } from "@/hooks/use-saved-searches";
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
      <h1 className="mb-4 text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("dashboard.title")}</h1>

      {isLoading && <p className="text-slate-500 dark:text-slate-400">{t("dashboard.loading")}</p>}
      {!isLoading && searches.length === 0 && (
        <p className="text-slate-500 dark:text-slate-400">{t("dashboard.empty")}</p>
      )}

      <ul className="flex flex-col gap-3">
        {searches.map((search) => (
          <li
            key={search.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div>
              <div className="font-medium text-slate-900 dark:text-slate-100">{search.name}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
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
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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

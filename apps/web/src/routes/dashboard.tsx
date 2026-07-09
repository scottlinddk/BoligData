import { useState } from "react";
import { useSavedSearches } from "@/hooks/use-saved-searches";
import type { AlertFrequency } from "@shared/types/index";

const ALERT_OPTIONS: { value: AlertFrequency; label: string }[] = [
  { value: "none", label: "No alerts" },
  { value: "immediate", label: "Immediate" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

export function DashboardPage() {
  const { searches, isLoading, updateAlert } = useSavedSearches();
  const [pendingId, setPendingId] = useState<string | null>(null);

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
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Saved searches</h1>

      {isLoading && <p className="text-slate-500">Loading...</p>}
      {!isLoading && searches.length === 0 && (
        <p className="text-slate-500">
          No saved searches yet. Save a filter from the search page to get alerted about new matches.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {searches.map((search) => (
          <li
            key={search.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4"
          >
            <div>
              <div className="font-medium text-slate-900">{search.name}</div>
              <div className="text-xs text-slate-500">
                Last alert:{" "}
                {search.lastAlertAt ? new Date(search.lastAlertAt).toLocaleDateString("da-DK") : "never"}
              </div>
            </div>
            <select
              value={search.alertFrequency}
              disabled={pendingId === search.id}
              onChange={(e) => handleAlertChange(search.id, e.target.value as AlertFrequency)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              {ALERT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}

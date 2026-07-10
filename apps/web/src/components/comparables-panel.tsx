import type { ComparableEntry } from "@shared/types/api";
import type { SoldPriceEntry } from "@shared/types/index";
import { formatDkk } from "@shared/utils/price";
import { useI18n } from "@/i18n/i18n";
import { SparklineChart } from "./sparkline-chart";

interface ComparablesPanelProps {
  soldPriceHistory: SoldPriceEntry[];
  comparables: ComparableEntry[];
  neighborhoodAvgPricePerSqm: number | null;
}

export function ComparablesPanel({
  soldPriceHistory,
  comparables,
  neighborhoodAvgPricePerSqm,
}: ComparablesPanelProps) {
  const { t } = useI18n();
  const sortedHistory = [...soldPriceHistory].sort((a, b) => a.soldDate.localeCompare(b.soldDate));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-2 font-semibold text-slate-900 dark:text-slate-100">{t("comparables.soldHistory")}</h3>
      <SparklineChart points={sortedHistory.map((h) => h.pricePerSqm)} />
      <ul className="mt-2 flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
        {sortedHistory.map((entry) => (
          <li key={entry.soldDate}>
            {t("comparables.historyEntry", {
              date: entry.soldDate,
              price: formatDkk(entry.price),
              pricePerSqm: formatDkk(entry.pricePerSqm),
            })}
          </li>
        ))}
      </ul>

      <h3 className="mb-2 mt-4 font-semibold text-slate-900 dark:text-slate-100">{t("comparables.title")}</h3>
      {neighborhoodAvgPricePerSqm !== null && (
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          {t("comparables.neighborhoodAvg", { price: formatDkk(neighborhoodAvgPricePerSqm) })}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {comparables.length === 0 && (
          <li className="text-xs text-slate-400 dark:text-slate-500">{t("comparables.none")}</li>
        )}
        {comparables.map((entry) => (
          <li
            key={entry.property.id}
            className="rounded-md border border-slate-100 px-3 py-2 text-sm dark:border-slate-800"
          >
            <div className="font-medium text-slate-800 dark:text-slate-200">{entry.property.address}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {t("comparables.soldEntry", {
                date: entry.soldDate,
                price: formatDkk(entry.price),
                pricePerSqm: formatDkk(entry.pricePerSqm),
                distance: Math.round(entry.distanceMeters),
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
    <div className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
      <h3 className="mb-2 text-[15px] font-extrabold text-ink">{t("comparables.soldHistory")}</h3>
      <SparklineChart points={sortedHistory.map((h) => h.pricePerSqm)} />
      <ul className="mt-2 flex flex-col gap-1 text-xs font-medium text-ink-soft">
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

      <h3 className="mb-2 mt-4 text-xs font-extrabold uppercase tracking-[0.02em] text-ink">{t("comparables.title")}</h3>
      {neighborhoodAvgPricePerSqm !== null && (
        <p className="mb-2 text-xs font-medium text-ink-soft">
          {t("comparables.neighborhoodAvg", { price: formatDkk(neighborhoodAvgPricePerSqm) })}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {comparables.length === 0 && <li className="text-xs font-medium text-ink-faint">{t("comparables.none")}</li>}
        {comparables.map((entry) => (
          <li key={entry.property.id} className="rounded-lg border border-border px-3 py-2 text-sm">
            <div className="font-bold text-ink">{entry.property.address}</div>
            <div className="text-xs font-medium text-ink-soft">
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

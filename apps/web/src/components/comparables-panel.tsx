import type { ComparableEntry } from "@shared/types/api";
import type { SoldPriceEntry } from "@shared/types/index";
import { formatDkk } from "@shared/utils/price";
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
  const sortedHistory = [...soldPriceHistory].sort((a, b) => a.soldDate.localeCompare(b.soldDate));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-2 font-semibold text-slate-900">Sold price history</h3>
      <SparklineChart points={sortedHistory.map((h) => h.pricePerSqm)} />
      <ul className="mt-2 flex flex-col gap-1 text-xs text-slate-500">
        {sortedHistory.map((entry) => (
          <li key={entry.soldDate}>
            {entry.soldDate}: {formatDkk(entry.price)} ({formatDkk(entry.pricePerSqm)}/m²)
          </li>
        ))}
      </ul>

      <h3 className="mb-2 mt-4 font-semibold text-slate-900">Comparable properties (last 12mo)</h3>
      {neighborhoodAvgPricePerSqm !== null && (
        <p className="mb-2 text-xs text-slate-500">
          Neighborhood avg: {formatDkk(neighborhoodAvgPricePerSqm)}/m²
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {comparables.length === 0 && (
          <li className="text-xs text-slate-400">No comparable sales found nearby.</li>
        )}
        {comparables.map((entry) => (
          <li key={entry.property.id} className="rounded-md border border-slate-100 px-3 py-2 text-sm">
            <div className="font-medium text-slate-800">{entry.property.address}</div>
            <div className="text-xs text-slate-500">
              Sold {entry.soldDate} · {formatDkk(entry.price)} · {formatDkk(entry.pricePerSqm)}/m² ·{" "}
              {Math.round(entry.distanceMeters)}m away
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

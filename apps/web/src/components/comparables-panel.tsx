import type { ComparableEntry } from "@shared/types/api";
import type { SoldPriceEntry } from "@shared/types/index";
import type { NearbySaleEntry } from "@shared/types/property-lookup";
import type { FactSource } from "@/lib/property-facts";
import { formatDkk } from "@shared/utils/price";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import { SparklineChart } from "./sparkline-chart";

interface ComparablesPanelProps {
  soldPriceHistory: SoldPriceEntry[];
  /** Where the history came from — a live Boligsiden read, or the stored crawl row. */
  priceHistorySource?: FactSource | null;
  /** "Salg i nærheden": recent registered sales around the address, nearest first. */
  nearbySales?: NearbySaleEntry[];
  comparables: ComparableEntry[];
  neighborhoodAvgPricePerSqm: number | null;
}

/**
 * A sale that isn't an arm's-length transaction says nothing about market
 * value, so family transfers and forced auctions are labelled rather than
 * shown as if they were ordinary sales.
 */
function SaleTypeTag({ saleType }: { saleType: SoldPriceEntry["saleType"] }) {
  const { t } = useI18n();
  if (saleType === undefined || saleType === "normal") return null;
  return (
    <span className="ds-mono ml-1.5 rounded-[5px] bg-warning-soft px-1.5 py-0.5 text-[9px] text-warning">
      {t(`saleType.${saleType}` as TranslationKey)}
    </span>
  );
}

export function ComparablesPanel({
  soldPriceHistory,
  priceHistorySource = null,
  nearbySales = [],
  comparables,
  neighborhoodAvgPricePerSqm,
}: ComparablesPanelProps) {
  const { t } = useI18n();
  const sortedHistory = [...soldPriceHistory].sort((a, b) => a.soldDate.localeCompare(b.soldDate));

  // Only arm's-length sales belong in a neighbourhood average; a family
  // transfer at half price would drag it somewhere meaningless.
  const marketSales = nearbySales.filter((sale) => sale.saleType === "normal");
  const nearbyAvgPricePerSqm =
    marketSales.length > 0
      ? Math.round(marketSales.reduce((sum, s) => sum + s.pricePerSqm, 0) / marketSales.length)
      : null;

  return (
    <div className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-extrabold text-ink">{t("comparables.soldHistory")}</h3>
        {priceHistorySource !== null && (
          <span
            className={`ds-mono rounded-[5px] px-1.5 py-0.5 text-[9px] ${
              priceHistorySource === "register" ? "bg-success-soft text-success" : "bg-surface-alt text-ink-faint"
            }`}
          >
            {priceHistorySource === "register" ? t("register.badgeLive") : t("register.badgeStored")}
          </span>
        )}
      </div>
      {sortedHistory.length === 0 ? (
        <p className="text-xs font-medium text-ink-faint">{t("comparables.noHistory")}</p>
      ) : (
        <>
          <SparklineChart points={sortedHistory.map((h) => h.pricePerSqm)} />
          <ul className="mt-2 flex flex-col gap-1 text-xs font-medium text-ink-soft">
            {sortedHistory.map((entry) => (
              <li key={`${entry.soldDate}-${entry.price}`}>
                {t("comparables.historyEntry", {
                  date: entry.soldDate,
                  price: formatDkk(entry.price),
                  pricePerSqm: formatDkk(entry.pricePerSqm),
                })}
                <SaleTypeTag saleType={entry.saleType} />
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="mb-2 mt-4 text-xs font-extrabold uppercase tracking-[0.02em] text-ink">
        {t("comparables.nearbySales")}
      </h3>
      {nearbyAvgPricePerSqm !== null && (
        <p className="mb-2 text-xs font-medium text-ink-soft">
          {t("comparables.nearbyAvg", { price: formatDkk(nearbyAvgPricePerSqm), count: marketSales.length })}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {nearbySales.length === 0 && <li className="text-xs font-medium text-ink-faint">{t("comparables.none")}</li>}
        {nearbySales.map((sale) => (
          <li key={`${sale.address}-${sale.soldDate}`} className="rounded-lg border border-border px-3 py-2 text-sm">
            <div className="font-bold text-ink">
              {sale.address}
              <SaleTypeTag saleType={sale.saleType} />
            </div>
            <div className="text-xs font-medium text-ink-soft">
              {t("comparables.soldEntry", {
                date: sale.soldDate,
                price: formatDkk(sale.price),
                pricePerSqm: formatDkk(sale.pricePerSqm),
                distance: sale.distanceMeters,
              })}
            </div>
          </li>
        ))}
      </ul>

      {comparables.length > 0 && (
        <>
          <h3 className="mb-2 mt-4 text-xs font-extrabold uppercase tracking-[0.02em] text-ink">
            {t("comparables.title")}
          </h3>
          {neighborhoodAvgPricePerSqm !== null && (
            <p className="mb-2 text-xs font-medium text-ink-soft">
              {t("comparables.neighborhoodAvg", { price: formatDkk(neighborhoodAvgPricePerSqm) })}
            </p>
          )}
          <ul className="flex flex-col gap-2">
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
        </>
      )}
    </div>
  );
}

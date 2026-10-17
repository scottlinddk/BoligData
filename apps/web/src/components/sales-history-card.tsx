import { formatDkk } from "@shared/utils/price";
import { useI18n } from "@/i18n/i18n";
import type { AddressReport } from "@/lib/address-report";
import { formatSaleDate, summarizeSales, type SaleRow } from "@/lib/sales-history";

interface SalesHistoryCardProps {
  history: AddressReport["priceHistory"];
  /** Whether the sales register answered. When it did not, an empty list means "unknown", never "never sold". */
  available: boolean;
  match: AddressReport["priceHistoryMatch"];
}

/**
 * The address's own registered sales: the latest one up front with its date and year, then every sale.
 *
 * A family transfer or a forced auction is labelled and, when it is the newest sale, followed by the newest
 * ordinary one, because a price that is not a market price is easy to misread as one. An empty list says why it
 * is empty (never sold, address not found, several homes at the address, register down) instead of one blank.
 */
export function SalesHistoryCard({ history, available, match }: SalesHistoryCardProps) {
  const { t, language } = useI18n();
  const { rows, latest, latestFreeTrade } = summarizeSales(history);

  const typeLabel = (row: SaleRow) => (row.saleType === "normal" ? t("address.sales.type.normal") : t(`saleType.${row.saleType}`));
  const tag = (row: SaleRow) => row.saleType === "normal" ? null
    : <span className="ds-mono ml-1.5 rounded-[5px] bg-warning-soft px-1.5 py-0.5 text-[9px] text-warning-text">{typeLabel(row)}</span>;

  const emptyText = !available ? t("address.sales.unavailable")
    : match === "not_found" ? t("address.sales.notFound")
      : match === "ambiguous" ? t("address.sales.ambiguous")
        : t("address.sales.none");

  return (
    <section id="sales" aria-labelledby="sales-heading" className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="sales-heading" className="text-[15px] font-extrabold text-ink">{t("address.sales.title")}</h3>
        {latest && <span className="ds-mono rounded-[5px] bg-success-soft px-1.5 py-0.5 text-[9px] text-success-text">{t("register.badgeLive")}</span>}
      </div>

      {!latest ? (
        <p role="status" className="mt-2 text-[12.5px] text-ink-soft">{emptyText}</p>
      ) : (
        <>
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">{t("address.sales.latest")} · {latest.year}</p>
            <p className="mt-1.5 text-[32px] font-semibold leading-none tracking-[-0.04em] text-ink">{formatDkk(latest.price)}</p>
            <p className="mt-2 text-sm text-ink-soft">
              <time dateTime={latest.soldDate}>{t("address.sales.soldOn", { date: formatSaleDate(latest.soldDate, language) })}</time>
              {tag(latest)}
              {latest.pricePerSqm !== null && <span> · {formatDkk(latest.pricePerSqm)} / m²</span>}
            </p>
            {latestFreeTrade && (
              <p className="mt-2 text-xs text-ink-soft">
                {t("address.sales.latestFreeTrade", { price: formatDkk(latestFreeTrade.price), date: formatSaleDate(latestFreeTrade.soldDate, language) })}
              </p>
            )}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left text-[13px]">
              <caption className="sr-only">{t("address.sales.title")}</caption>
              <thead>
                <tr className="border-b border-border text-xs font-medium text-ink-soft">
                  <th scope="col" className="py-2 pr-3 font-medium">{t("address.sales.col.year")}</th>
                  <th scope="col" className="py-2 pr-3 font-medium">{t("address.sales.col.date")}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t("address.sales.col.price")}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t("address.sales.col.perSqm")}</th>
                  <th scope="col" className="py-2 font-medium">{t("address.sales.col.type")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.soldDate}-${row.price}`} className="border-b border-border last:border-0">
                    <th scope="row" className="py-2 pr-3 font-semibold text-ink">
                      {row.year}
                      {/* The type column can scroll out of view on a phone, and a family sale must not read as an ordinary one. */}
                      {row.saleType !== "normal" && <span className="mt-0.5 block text-[10px] font-medium text-warning-text sm:hidden">{typeLabel(row)}</span>}
                    </th>
                    <td className="py-2 pr-3 text-ink-soft"><time dateTime={row.soldDate}>{formatSaleDate(row.soldDate, language, "short")}</time></td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums text-ink">{formatDkk(row.price)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">{row.pricePerSqm !== null ? formatDkk(row.pricePerSqm) : "–"}</td>
                    <td className="py-2 text-ink-soft">{typeLabel(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="mt-3 text-[11px] leading-4 text-ink-faint">{t("address.sales.source")}</p>
    </section>
  );
}

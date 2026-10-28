import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDkk } from "@shared/utils/price";
import { ApiError, getProperty } from "@/lib/api";
import { mergePropertyFacts } from "@/lib/property-facts";
import { buildPriceHistoryRows, type PriceHistoryRow } from "@/lib/price-history";
import { formatPeriod } from "@/lib/smart-estimate";
import { useSparEstimate } from "@/hooks/use-spar";
import { useI18n } from "@/i18n/i18n";
import { EstimateChart } from "@/components/estimate/estimate-chart";
import { LoadingStatus, Skeleton } from "@/components/ui/loading";

const INITIAL_ROWS = 5;
const SALE_TYPE_LABEL = { family: ["familiehandel", "family sale"], auction: ["auktion", "auction"], other: ["anden handel", "other transfer"] } as const;

/**
 * Phone-first full page for the estimate: a dark hero with the number, then a sheet with the history
 * chart and the price-history table. Same data and same caveats as the section on the listing page.
 */
export function PropertyEstimatePage() {
  const { t, language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const detail = useQuery({ queryKey: ["property", id], queryFn: () => getProperty(id!), enabled: !!id });
  const spar = useSparEstimate(id ?? "");
  const property = detail.data?.property;

  useEffect(() => {
    document.title = `${tx("Estimeret værdi", "Estimated value")} | ${t("app.name")}`;
    return () => { document.title = t("app.name"); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const back = () => { if (window.history.state?.idx > 0) navigate(-1); else navigate(id ? `/property/${id}` : "/"); };
  const fair = spar.data?.status === "available" ? spar.data : null;

  const rows: PriceHistoryRow[] = property ? (() => {
    const facts = mergePropertyFacts(property, detail.data?.enrichment ?? null, null);
    return buildPriceHistoryRows({
      property, sales: facts.priceHistory,
      originalAsking: null,
    });
  })() : [];
  const visibleRows = showAll ? rows : rows.slice(0, INITIAL_ROWS);
  const eventLabel = (row: PriceHistoryRow) => {
    const base = row.event === "listed" ? tx("Til salg", "Listed for sale") : row.event === "original_asking" ? tx("Oprindelig udbudspris", "Original asking price") : tx("Solgt", "Sold");
    return row.saleType ? `${base} (${SALE_TYPE_LABEL[row.saleType][language === "da" ? 0 : 1]})` : base;
  };
  const dateLabel = (date: string | null) => date ? new Date(`${date}T00:00:00Z`).toLocaleDateString(language === "da" ? "da-DK" : "en-GB", { timeZone: "UTC" }) : tx("Ukendt dato", "Unknown date");

  if (detail.error instanceof ApiError && detail.error.status === 401) return <p className="p-6 text-danger">{t("search.signInForDetails")} <Link to="/auth/signin" className="underline">{t("nav.signIn")}</Link></p>;
  if (detail.isError) return <div role="alert" className="mx-auto max-w-xl p-6 text-danger"><p>{t("detail.notFound")}</p><button type="button" onClick={() => { void detail.refetch(); }} className="mt-3 font-semibold underline">{t("common.retry")}</button></div>;

  return <div className="mx-auto min-h-[80dvh] max-w-2xl bg-paper">
    <div className="rounded-b-[28px] px-5 pb-16 pt-5" style={{ backgroundColor: "var(--color-footer-bg)", color: "var(--color-footer-text)" }}>
      <div className="flex items-center gap-3">
        <button type="button" onClick={back} aria-label={t("detail.back")} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
        </button>
        <h1 className="flex-1 pr-10 text-center text-base font-medium">{tx("Estimeret værdi", "Estimated value")}</h1>
      </div>
      <div className="mt-8 text-center">
        {property && <p className="truncate px-6 text-sm" style={{ color: "var(--color-footer-muted)" }}>{property.address}</p>}
        {spar.isPending || detail.isPending ? <Skeleton className="mx-auto mt-4 h-12 w-64 rounded-lg !bg-white/10" /> : fair?.fairPrice ? <>
          <p className="mt-3 text-[40px] font-semibold leading-none tracking-[-0.045em]">{formatDkk(Math.round(fair.fairPrice.estimate))}</p>
          <p className="mt-4 text-sm">{tx("Estimeret interval", "Estimated range")}: {formatDkk(Math.round(fair.fairPrice.lo80))} – {formatDkk(Math.round(fair.fairPrice.hi80))}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-footer-muted)" }}>{tx("80 % interval. Et estimat, ikke en vurdering.", "80% interval. An estimate, not an appraisal.")}</p>
        </> : <>
          <p className="mt-4 text-2xl font-semibold tracking-tight">{tx("Ingen estimat endnu", "No estimate yet")}</p>
          <p className="mx-auto mt-2 max-w-xs text-sm" style={{ color: "var(--color-footer-muted)" }}>
            {spar.isError ? tx("Estimatet kunne ikke hentes lige nu.", "The estimate could not be retrieved right now.")
              : spar.data?.reason === "too_few_sales" ? tx("Der er for få handler til et pålideligt estimat for denne boligtype.", "There are too few sales for a reliable estimate for this property type.")
              : spar.data?.reason === "valuation_vintage_mismatch" ? tx("Boligens vurdering kan ikke sammenlignes med markedsindekset.", "This home's valuation cannot be compared with the market index.")
              : tx("Vi har endnu ikke en offentlig vurdering for denne bolig.", "We do not have a public valuation for this home yet.")}
          </p>
          {spar.isError && <button type="button" onClick={() => { void spar.refetch(); }} className="mt-3 text-sm font-semibold underline">{t("common.retry")}</button>}
        </>}
      </div>
    </div>

    <div className="-mt-8 rounded-t-[28px] bg-surface px-5 pb-12 pt-6 shadow-lift">
      {fair && fair.history.length >= 2 && <section aria-labelledby="value-history-heading">
        <h2 id="value-history-heading" className="text-lg font-semibold tracking-tight">{tx("Estimeret værdi over tid", "Estimated value over time")}</h2>
        <p className="mt-1 text-xs leading-5 text-ink-soft">{tx(`Boligens vurdering omregnet med markedets niveau måned for måned, til og med ${formatPeriod(fair.history[fair.history.length - 1]!.period, language)}.`, `The home's valuation re-priced at the market level month by month, up to ${formatPeriod(fair.history[fair.history.length - 1]!.period, language)}.`)}</p>
        <div className="mt-4"><EstimateChart history={fair.history} askingPrice={fair.askingPrice} height={240} /></div>
      </section>}

      <section aria-labelledby="price-history-heading" className={fair ? "mt-10" : ""}>
        <h2 id="price-history-heading" className="text-lg font-semibold tracking-tight">{tx("Prishistorik", "Price history")}</h2>
        {detail.isPending ? <LoadingStatus className="mt-4">{tx("Henter prishistorik…", "Loading price history…")}</LoadingStatus>
          : rows.length === 0 ? <p className="mt-3 rounded-xl border border-border p-4 text-sm text-ink-soft">{tx("Vi har ingen registrerede handler eller verificerede udbudspriser for denne bolig.", "We have no registered sales or verified asking prices for this home.")}</p>
          : <>
            <div className="mt-4 overflow-hidden rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-alt text-xs text-ink-soft"><tr><th scope="col" className="px-4 py-3 font-medium">{tx("Dato", "Date")}</th><th scope="col" className="px-4 py-3 font-medium">{tx("Hændelse", "Event")}</th><th scope="col" className="px-4 py-3 text-right font-medium">{tx("Pris", "Price")}</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {visibleRows.map((row, index) => <tr key={`${row.event}-${row.date}-${index}`}>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{dateLabel(row.date)}</td>
                    <td className="px-4 py-3">{eventLabel(row)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium">{formatDkk(row.price)}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            {rows.length > INITIAL_ROWS && <button type="button" onClick={() => setShowAll(value => !value)} aria-expanded={showAll} className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl border border-border-strong text-sm font-semibold transition hover:bg-surface-hover">
              {showAll ? tx("Vis færre", "Show fewer") : tx(`Vis mere (${rows.length - INITIAL_ROWS})`, `Show more (${rows.length - INITIAL_ROWS})`)}
            </button>}
            <p className="mt-3 text-xs leading-5 text-ink-soft">{tx("Handler fra registre. Udbudspriser kun når kilden oplyser dem. Familiehandler er ikke markedspriser.", "Sales from registers. Asking prices only when the source reports them. Family transfers are not market prices.")}</p>
          </>}
      </section>
      {property && <Link to={`/property/${property.id}`} className="mt-8 flex min-h-12 items-center justify-center rounded-xl bg-cta text-sm font-semibold text-cta-text transition hover:bg-cta-hover">{tx("Se hele boligen", "View the whole listing")}</Link>}
    </div>
  </div>;
}

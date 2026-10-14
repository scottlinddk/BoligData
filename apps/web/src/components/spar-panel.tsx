import type { SparListingEstimate } from "@shared/types/spar";
import { formatDkk } from "@shared/utils/price";
import { useI18n } from "@/i18n/i18n";
import { useSparEstimate } from "@/hooks/use-spar";

export function SparPanel({ propertyId }: { propertyId: string }) {
  const query = useSparEstimate(propertyId);
  return <SparContent result={query.data} loading={query.isPending} failed={query.isError} onRetry={() => { void query.refetch(); }} />;
}

const pct = (n: number, digits = 0) => `${n >= 0 ? "+" : "−"}${Math.abs(n * 100).toFixed(digits)} %`;

export function SparContent({ result, loading, failed, onRetry }: { result?: SparListingEstimate; loading: boolean; failed: boolean; onRetry: () => void }) {
  const { language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const fair = result?.status === "available" ? result : null;
  const unavailableText = result?.reason === "too_few_sales" || result?.reason === "stale_index"
    ? tx("Der er for få eller for gamle handler til et pålideligt SPAR-niveau for denne boligtype endnu.", "There are too few or too old sales for a reliable SPAR level for this property type yet.")
    : result?.reason === "valuation_vintage_mismatch"
      ? tx("Boligens vurdering er fra et andet vurderingsår end resten af markedsindekset og kan ikke sammenlignes.", "This home's valuation is from a different valuation year than the rest of the market index and cannot be compared.")
      : tx("Vi har endnu ikke en offentlig vurdering for denne bolig.", "We do not have a public valuation for this home yet.");
  return <section className="rounded-2xl bg-surface-alt p-5 sm:p-7" aria-labelledby="spar-heading">
    <h2 id="spar-heading" className="text-xl font-medium tracking-tight">{tx("SPAR og fair pris (estimat)", "SPAR and fair price (estimate)")}</h2>
    <p className="mt-1 text-sm text-ink-soft">{tx("Salgspris i forhold til offentlig vurdering, beregnet ud fra vores egne handler", "Sale price relative to the public valuation, calculated from our own sales")}</p>
    {loading && <p role="status" className="mt-4 text-sm text-ink-soft">{tx("Beregner…", "Calculating…")}</p>}
    {!loading && failed && <div role="status" className="mt-4 rounded-xl border border-border p-4 text-sm">
      <p>{tx("SPAR-estimatet kunne ikke hentes lige nu.", "The SPAR estimate could not be retrieved right now.")}</p>
      <button type="button" onClick={onRetry} className="mt-2 font-semibold underline">{tx("Prøv igen", "Try again")}</button>
    </div>}
    {!loading && !failed && result && !fair && <p role="status" className="mt-4 rounded-xl border border-border p-4 text-sm">{unavailableText}</p>}
    {!loading && !failed && fair?.valuation && fair.index && fair.fairPrice && <>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4"><dt className="text-xs text-ink-soft">{tx("Offentlig vurdering", "Public valuation")} ({fair.valuation.year})</dt><dd className="mt-1 text-lg font-semibold">{formatDkk(fair.valuation.valueDkk)}</dd></div>
        <div className="rounded-xl border border-border bg-surface p-4"><dt className="text-xs text-ink-soft">{tx("SPAR-niveau", "SPAR level")} ({fair.index.period})</dt><dd className="mt-1 text-lg font-semibold">{fair.index.ratio.toFixed(2)}</dd>
          <dd className="text-xs text-ink-soft">{tx("80 % interval", "80% interval")} {fair.index.lo80.toFixed(2)}–{fair.index.hi80.toFixed(2)}</dd></div>
        <div className="rounded-xl border border-border bg-surface p-4"><dt className="text-xs text-ink-soft">{tx("Estimeret fair pris", "Estimated fair price")}</dt><dd className="mt-1 text-lg font-semibold">{formatDkk(Math.round(fair.fairPrice.estimate))}</dd>
          <dd className="text-xs text-ink-soft">{tx("80 % interval", "80% interval")} {formatDkk(Math.round(fair.fairPrice.lo80))}–{formatDkk(Math.round(fair.fairPrice.hi80))}</dd></div>
      </dl>
      {fair.askingVsFair !== null && fair.askingPrice !== null && <p className="mt-4 text-sm">{tx("Udbudspris", "Asking price")} {formatDkk(fair.askingPrice)}: <strong>{pct(fair.askingVsFair)}</strong> {tx("i forhold til estimatet", "relative to the estimate")}
        {fair.askingPrice >= fair.fairPrice.lo80 && fair.askingPrice <= fair.fairPrice.hi80 && <> ({tx("inden for 80 % intervallet", "inside the 80% interval")})</>}.</p>}
      <p className="mt-4 text-xs leading-5 text-ink-soft">
        {tx(`Estimat, ikke Danmarks Statistiks tal. Bygger på ${fair.index.nSales} frie handler (${fair.isUnit ? "ejerlejligheder" : "huse"}) mod vurderingsåret ${fair.index.valuationVintage}; seneste måned har ${fair.index.nPeriod} handler.`,
          `An estimate, not Statistics Denmark data. Based on ${fair.index.nSales} free-trade sales (${fair.isUnit ? "apartments" : "houses"}) against valuation year ${fair.index.valuationVintage}; the latest month has ${fair.index.nPeriod} sales.`)}
        {fair.index.preliminary && <> {tx("Seneste måneder er foreløbige og kan ændre sig.", "The latest months are preliminary and may change.")}</>}
        {" "}{tx("Intervallet er groft og ikke backtestet. Det siger intet om boligens stand, beliggenhed eller renovering.", "The interval is rough and not backtested. It says nothing about the home's condition, location or renovations.")}
      </p>
    </>}
  </section>;
}

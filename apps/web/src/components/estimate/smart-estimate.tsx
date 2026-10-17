import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { SparListingEstimate } from "@shared/types/spar";
import { formatDkk } from "@shared/utils/price";
import { useI18n } from "@/i18n/i18n";
import { useSparEstimate } from "@/hooks/use-spar";
import { estimateFactors, formatPeriod, formatSignedPercent, type EstimateFactor } from "@/lib/smart-estimate";
import { Skeleton } from "@/components/ui/loading";
import { EstimateChart } from "./estimate-chart";
import { RangeBar } from "./range-bar";

export function SmartEstimate({ propertyId, propertyType, onShowCalculation }: { propertyId: string; propertyType?: string | null; onShowCalculation?: () => void }) {
  const query = useSparEstimate(propertyId);
  return <SmartEstimateView result={query.data} loading={query.isPending} failed={query.isError} onRetry={() => { void query.refetch(); }} propertyType={propertyType} fullPageHref={`/property/${propertyId}/value`} onShowCalculation={onShowCalculation} />;
}

const icons = {
  check: <path d="m5 12 4.5 4.5L19 7" />,
  warn: <><path d="M12 4 3 20h18L12 4Z" /><path d="M12 10v4M12 17h.01" /></>,
};

function FactorRow({ factor }: { factor: EstimateFactor }) {
  const { language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const warn = factor.kind === "stale" || factor.kind === "preliminary" || (factor.kind === "asking_vs_valuation" && factor.band !== "within");
  let text: ReactNode;
  switch (factor.kind) {
    case "valuation":
      text = tx(`Offentlig vurdering ${factor.year}: ${formatDkk(factor.valueDkk)}`, `Public valuation ${factor.year}: ${formatDkk(factor.valueDkk)}`); break;
    case "market_level":
      text = tx(`${factor.isUnit ? "Ejerlejligheder" : "Huse"} sælges til ${Math.round(factor.ratio * 100)} % af vurderingen (${formatPeriod(factor.period, language)}, ${factor.nSales} handler)`,
        `${factor.isUnit ? "Apartments" : "Houses"} sell at ${Math.round(factor.ratio * 100)}% of the valuation (${formatPeriod(factor.period, language)}, ${factor.nSales} sales)`); break;
    case "trend":
      text = tx(`Markedsniveauet er ${formatSignedPercent(factor.change, language, 1)} de seneste ${factor.months} måneder`, `The market level is ${formatSignedPercent(factor.change, language, 1)} over the last ${factor.months} months`); break;
    case "asking_vs_estimate":
      text = tx(`Udbudspris ${formatDkk(factor.askingPrice)} er ${formatSignedPercent(factor.ratio, language)} i forhold til estimatet${factor.withinInterval ? ", inden for 80 % intervallet" : ", uden for 80 % intervallet"}`,
        `Asking price ${formatDkk(factor.askingPrice)} is ${formatSignedPercent(factor.ratio, language)} relative to the estimate${factor.withinInterval ? ", inside the 80% interval" : ", outside the 80% interval"}`); break;
    case "asking_vs_valuation":
      text = tx(`Udbudspris er ${formatSignedPercent(factor.percent / 100, language, 1)} i forhold til vurderingen. ${factor.band === "within" ? `Inden for den normale afvigelse på ±${factor.tolerancePercent} %` : `Uden for den normale afvigelse på ±${factor.tolerancePercent} %`}`,
        `Asking price is ${formatSignedPercent(factor.percent / 100, language, 1)} relative to the valuation. ${factor.band === "within" ? `Within the normal ±${factor.tolerancePercent}% deviation` : `Outside the normal ±${factor.tolerancePercent}% deviation`}`); break;
    case "stale":
      text = tx(`Gammelt niveau: seneste handel i indekset er fra ${formatPeriod(factor.period, language)}, ${factor.ageMonths} måneder siden`, `Old level: the newest sale in the index is from ${formatPeriod(factor.period, language)}, ${factor.ageMonths} months ago`); break;
    case "preliminary":
      text = tx("De seneste måneder er foreløbige og kan ændre sig", "The latest months are preliminary and may change"); break;
  }
  return <li className="flex gap-2.5 text-sm leading-5">
    <svg viewBox="0 0 24 24" className={`mt-0.5 h-4 w-4 shrink-0 ${warn ? "text-warning-text" : "text-ink-soft"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{warn ? icons.warn : icons.check}</svg>
    <span>{text}</span>
  </li>;
}

export function SmartEstimateView({ result, loading, failed, onRetry, propertyType, fullPageHref, onShowCalculation }: { result?: SparListingEstimate; loading: boolean; failed: boolean; onRetry: () => void; propertyType?: string | null; fullPageHref?: string; onShowCalculation?: () => void }) {
  const { language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const [helpOpen, setHelpOpen] = useState(false);
  const fair = result?.status === "available" && result.fairPrice && result.index ? result : null;
  const unavailable = result?.reason === "unsupported_property_type"
    ? tx("Estimatet findes kun for huse. Lejligheder og andre boligtyper kan ikke prissættes ud fra en bygnings vurdering.", "The estimate only covers houses. Apartments and other property types cannot be priced from a building's valuation.")
    : result?.reason === "too_few_sales"
    ? tx("Der er for få handler til et pålideligt estimat for denne boligtype endnu.", "There are too few sales for a reliable estimate for this property type yet.")
    : result?.reason === "valuation_vintage_mismatch"
      ? tx("Boligens vurdering er fra et andet vurderingsår end resten af markedsindekset og kan ikke sammenlignes.", "This home's valuation is from a different valuation year than the rest of the market index and cannot be compared.")
      : tx("Vi har endnu ikke en offentlig vurdering for denne bolig, så vi kan ikke estimere en pris.", "We do not have a public valuation for this home yet, so we cannot estimate a price.");

  return <section id="estimate" aria-labelledby="estimate-heading" className="section-anchor min-w-0 rounded-2xl bg-surface-alt p-5 sm:p-7">
    <div className="flex items-center gap-2.5">
      <h2 id="estimate-heading" className="text-xl font-medium tracking-tight">{tx("Smart estimat", "Smart estimate")}</h2>
      <button type="button" onClick={() => setHelpOpen(open => !open)} aria-expanded={helpOpen} aria-controls="estimate-help" aria-label={tx("Sådan beregnes estimatet", "How the estimate is calculated")}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-border-strong bg-surface text-xs font-semibold text-ink-soft transition hover:bg-surface-hover">?</button>
    </div>
    <p className="mt-1 text-sm text-ink-soft">{tx("Boligens offentlige vurdering omregnet med markedets niveau, ikke en vurdering af netop denne bolig", "The public valuation re-priced at the market level, not an appraisal of this particular home")}</p>
    {helpOpen && <p id="estimate-help" className="ui-enter mt-3 rounded-xl border border-border bg-surface p-4 text-sm leading-6">
      {tx("Estimatet er boligens offentlige ejendomsværdi gange det niveau, som lignende boliger faktisk sælges til i forhold til deres vurdering (vores eget SPAR-niveau, udjævnet over tid). Intervallet viser, hvor meget enkelte handler plejer at afvige. Det siger intet om stand, beliggenhed, udsigt eller renovering, og det er ikke en mæglervurdering.",
        "The estimate is the home's public property valuation times the level at which similar homes actually sell relative to their valuation (our own SPAR level, smoothed over time). The interval shows how far single sales usually deviate. It says nothing about condition, location, view or renovation, and it is not a broker's appraisal.")}
    </p>}

    {loading && <div role="status" aria-label={tx("Beregner estimat", "Calculating estimate")} className="mt-6 grid gap-5"><Skeleton className="h-[300px] rounded-xl" /><Skeleton className="h-[220px] rounded-xl" /></div>}
    {!loading && failed && <div role="status" className="mt-5 rounded-xl border border-border bg-surface p-4 text-sm">
      <p>{tx("Estimatet kunne ikke hentes lige nu.", "The estimate could not be retrieved right now.")}</p>
      <button type="button" onClick={onRetry} className="mt-2 font-semibold underline">{tx("Prøv igen", "Try again")}</button>
    </div>}
    {!loading && !failed && result && !fair && <p role="status" className="mt-5 rounded-xl border border-border bg-surface p-4 text-sm">{unavailable}</p>}

    {!loading && !failed && fair && fair.fairPrice && <>
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5">
        <div className="min-w-0 rounded-xl border border-border bg-surface p-4 sm:p-5">
          <p className="mb-3 text-xs text-ink-soft">{tx("Fair pris over tid med 80 % interval. Streget linje er foreløbige måneder.", "Fair price over time with the 80% interval. Dotted line is preliminary months.")}</p>
          {fair.history.length >= 2
            ? <EstimateChart history={fair.history} askingPrice={fair.askingPrice} />
            : <p className="py-10 text-center text-sm text-ink-soft">{tx("For lidt historik til at tegne en kurve.", "Too little history to draw a curve.")}</p>}
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-card md:grid md:grid-cols-2 md:gap-8">
          <div className="md:self-center"><RangeBar fair={fair.fairPrice} askingPrice={fair.askingPrice} /></div>
          <div className="mt-6 border-t border-border pt-5 md:mt-0 md:border-l md:border-t-0 md:pl-8 md:pt-0">
          <h3 className="text-sm font-semibold">{tx("Det bygger estimatet på", "What the estimate rests on")}</h3>
          <ul className="mt-3 grid gap-2.5">{estimateFactors(fair, propertyType).map(factor => <FactorRow key={factor.kind} factor={factor} />)}</ul>
          <a href="#spar" onClick={event => { if (onShowCalculation) { event.preventDefault(); onShowCalculation(); return; } const target = document.getElementById("spar"); if (!target) return; event.preventDefault(); target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); }}
            className="mt-5 flex min-h-11 items-center justify-center rounded-lg bg-cta px-4 text-sm font-semibold text-cta-text transition hover:bg-cta-hover">{tx("Se beregningen", "See the calculation")}</a>
          </div>
        </div>
      </div>
      {fullPageHref && <Link to={fullPageHref} className="mt-4 flex min-h-11 items-center justify-center rounded-lg border border-border-strong bg-surface text-sm font-semibold transition hover:bg-surface-hover lg:hidden">{tx("Åbn estimat og prishistorik", "Open estimate and price history")}</Link>}
      <p className="mt-4 text-xs leading-5 text-ink-soft">{tx("Et estimat, ikke en vurdering. Intervallet er groft og ikke backtestet.", "An estimate, not an appraisal. The interval is rough and not backtested.")}</p>
    </>}
  </section>;
}

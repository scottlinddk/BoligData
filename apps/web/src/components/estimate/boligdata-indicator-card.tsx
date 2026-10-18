import { formatDkk } from "@shared/utils/price";
import { useI18n } from "@/i18n/i18n";
import { INDICATOR_DISAGREEMENT_RATIO, type BoligDataIndicator } from "@/lib/boligdata-indicator";
import { formatSignedPercent } from "@/lib/smart-estimate";
import { BoligDataIndicatorInfo } from "./price-explainers";

/** The average of the independent price methods, with each input visible so the headline can be checked. */
export function BoligDataIndicatorCard({ indicator }: { indicator: BoligDataIndicator }) {
  const { language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const labels = { spar: tx("SPAR fair pris", "SPAR fair price"), timeOnMarket: tx("Pris efter liggetid", "Price by time on market") };
  const disagree = indicator.spreadRatio > INDICATOR_DISAGREEMENT_RATIO;
  return <section aria-labelledby="indicator-heading" data-testid="boligdata-indicator" className="mb-3 rounded-2xl border border-border-strong bg-surface-alt p-5 sm:p-6">
    <div className="flex items-center gap-2.5">
      <h2 id="indicator-heading" className="text-sm font-semibold uppercase tracking-[0.1em] text-ink-soft">{tx("BoligData-indikator", "BoligData indicator")}</h2>
      <BoligDataIndicatorInfo />
    </div>
    <p className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.04em]">{formatDkk(indicator.priceDkk)}</p>
    <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
      {indicator.sources.map(source => <div key={source.key} className="flex items-baseline justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2.5">
        <dt className="text-ink-soft">{labels[source.key]}</dt><dd className="font-semibold">{formatDkk(Math.round(source.priceDkk))}</dd>
      </div>)}
    </dl>
    {indicator.askingVsIndicator !== null && <p className="mt-3 text-sm">{tx("Udbudsprisen er", "The asking price is")} <strong>{formatSignedPercent(indicator.askingVsIndicator, language)}</strong> {tx("i forhold til indikatoren", "relative to the indicator")}.</p>}
    {disagree && <p role="note" className="mt-3 rounded-xl bg-warning-soft p-3 text-sm text-warning-text">{tx("De to metoder er langt fra hinanden. Gennemsnittet er et dårligt resumé, så se de enkelte tal.", "The two methods are far apart. The average is a poor summary, so look at the individual numbers.")}</p>}
    <p className="mt-3 text-xs leading-5 text-ink-soft">{tx("Et pejlemærke, ikke en vurdering. Gennemsnit af to metoder, der hver har deres begrænsninger.", "A reference point, not an appraisal. The average of two methods that each have limitations.")}</p>
  </section>;
}

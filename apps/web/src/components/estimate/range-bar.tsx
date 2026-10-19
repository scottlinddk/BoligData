import type { SparListingEstimate } from "@shared/types/spar";
import { formatDkk } from "@shared/utils/price";
import { useI18n } from "@/i18n/i18n";
import { rangeLayout } from "@/lib/smart-estimate";

type Fair = NonNullable<SparListingEstimate["fairPrice"]>;

/**
 * The 80 % interval inside the wider 95 % one, with the asking price as a marker. Neutral colours
 * on purpose: sitting above or below the estimate is information, not a verdict.
 */
export function RangeBar({ fair, askingPrice }: { fair: Fair; askingPrice: number | null }) {
  const { language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const layout = rangeLayout(fair, askingPrice);
  const askingText = askingPrice === null ? "" : layout.outside === "above"
    ? tx(`Udbudspris ${formatDkk(askingPrice)} er over det viste område.`, `The asking price ${formatDkk(askingPrice)} is above the range shown.`)
    : layout.outside === "below"
      ? tx(`Udbudspris ${formatDkk(askingPrice)} er under det viste område.`, `The asking price ${formatDkk(askingPrice)} is below the range shown.`)
      : tx(`Udbudspris ${formatDkk(askingPrice)} ligger inden for det viste område.`, `The asking price ${formatDkk(askingPrice)} is inside the range shown.`);
  return <figure className="m-0">
    <div className="flex justify-between text-xs text-ink-soft"><span>{tx("Lavere pris", "Lower price")}</span><span>{tx("Højere pris", "Higher price")}</span></div>
    <div role="img" aria-label={`${tx("Estimeret fair pris, 80 % interval", "Estimated fair price, 80% interval")} ${formatDkk(Math.round(fair.lo80))} – ${formatDkk(Math.round(fair.hi80))}. ${askingText}`} className="relative mt-2 h-9">
      <div className="absolute inset-x-0 top-[22px] h-2 rounded-full bg-surface-hover" />
      <div className="absolute top-[22px] h-2 rounded-full bg-brand" style={{ left: `${layout.lo80}%`, width: `${Math.max(layout.hi80 - layout.lo80, 1)}%` }} />
      <div className="absolute top-[18px] h-4 w-0.5 -translate-x-1/2 rounded bg-ink" style={{ left: `${layout.estimate}%` }} />
      {layout.asking !== null && <div className="absolute top-0 -translate-x-1/2" style={{ left: `${layout.asking}%` }}>
        <svg viewBox="0 0 12 10" className="h-3 w-3 text-ink" aria-hidden="true"><path d="M1 1h10L6 9z" fill="currentColor" /></svg>
      </div>}
    </div>
    <figcaption className="mt-3 text-center text-lg font-semibold tracking-tight">{formatDkk(Math.round(fair.lo80))} – {formatDkk(Math.round(fair.hi80))}</figcaption>
    <p className="mt-1 text-center text-xs text-ink-soft">{tx("80 % interval. Mest sandsynlige værdi", "80% interval. Most likely value")} {formatDkk(Math.round(fair.estimate))}</p>
  </figure>;
}

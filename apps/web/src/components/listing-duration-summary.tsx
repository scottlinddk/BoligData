import { useI18n } from "@/i18n/i18n";
import type { ReportedMarketingPeriod } from "@/lib/reported-listing-duration";

interface ListingDurationSummaryProps {
  /** Days with the current listing, as resolved by the listing chronology. */
  currentDays: number | null;
  /** The source's total marketing period, when it reports one. */
  period: ReportedMarketingPeriod | null;
}

/** Shows the total time on market across all listings at the address, and
 * whether that total spans a change of broker. The current listing's days
 * stay visible so neither figure is mistaken for the other. */
export function ListingDurationSummary({ currentDays, period }: ListingDurationSummaryProps) {
  const { language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const daysLabel = (days: number) => `${days} ${tx("dage", "days")}`;
  const hasEarlierPeriods = period !== null && period.totalDays > period.currentDays;

  if (!hasEarlierPeriods) {
    return <div className="my-5 flex items-center justify-between gap-3 border-y border-border py-4 text-sm">
      <span className="text-ink-soft">{tx("Liggetid", "Time on market")}</span>
      <span className="font-semibold">{currentDays !== null ? daysLabel(currentDays) : tx("Ikke oplyst", "Not reported")}</span>
    </div>;
  }

  const badge = period.brokerChanged
    ? tx("Inkl. mæglerskifte", "Includes broker change")
    : period.brokerChanged === false
      ? tx("Genudbudt hos samme mægler", "Relisted with same broker")
      : tx("Inkl. tidligere udbud", "Includes earlier listings");

  return <div className="my-5 space-y-3 border-y border-border py-4 text-sm">
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-soft">{tx("Samlet liggetid", "Total time on market")}</span>
      <span className="font-semibold">{daysLabel(period.totalDays)}</span>
    </div>
    <p><span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning-text">{badge}</span></p>
    {period.realtors && period.realtors.length > 1
      ? <ul className="space-y-1 text-xs text-ink-soft" aria-label={tx("Liggetid pr. mægler", "Time on market by broker")}>
          {period.realtors.map(realtor => <li key={realtor.realtorId} className="flex justify-between gap-3">
            <span>{realtor.realtorName ?? tx("Ukendt mægler", "Unknown broker")}{realtor.isCurrent && ` (${tx("nuværende", "current")})`}</span>
            <span className="whitespace-nowrap">{daysLabel(realtor.days)}</span>
          </li>)}
        </ul>
      : <div className="flex justify-between gap-3 text-xs text-ink-soft">
          <span>{tx("Aktuel annonce", "Current listing")}</span>
          <span className="whitespace-nowrap">{daysLabel(currentDays ?? period.currentDays)}</span>
        </div>}
    <p className="text-xs text-ink-soft">{tx(`Oplyst af Boligsiden ${period.observedAt.slice(0, 10)}. Pauser mellem udbud tæller ikke med.`,
      `Reported by Boligsiden ${period.observedAt.slice(0, 10)}. Gaps between listings are not counted.`)}</p>
  </div>;
}

import type { ReactNode } from "react";
import type { Average, SoldSummary } from "@/lib/sold-stats";
import type { SoldFormat } from "@/lib/sold-format";

function Kpi({ label, value, sub, emphasis }: { label: string; value: string; sub: ReactNode; emphasis?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${emphasis ? "border-cta bg-surface" : "border-border bg-surface-alt"}`}>
      <dt className="text-xs font-semibold text-ink-soft">{label}</dt>
      <dd className="mt-1 text-xl font-bold tabular-nums text-ink">{value}</dd>
      <dd className="mt-0.5 text-[11px] leading-snug tabular-nums text-ink-faint">{sub}</dd>
    </div>
  );
}

/** Averages of whatever the filter leaves, each with how many sales it rests on and the median beside it. */
export function SoldSummaryCards({ summary, fmt, tx }: { summary: SoldSummary; fmt: SoldFormat; tx: (da: string, en: string) => string }) {
  const sub = (a: Average | null, format: (v: number | null) => string) =>
    a ? `${tx("Median", "Median")} ${format(a.median)} · n=${a.n}` : tx("Ingen data", "No data");
  const mean = (a: Average | null) => (a ? a.mean : null);

  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi emphasis label={tx("Gns. afslag", "Avg. discount")} value={fmt.discount(mean(summary.discountPct))} sub={sub(summary.discountPct, fmt.discount)} />
      <Kpi label={tx("Gns. salgspris", "Avg. sold price")} value={fmt.dkk(mean(summary.soldPrice) === null ? null : Math.round(summary.soldPrice!.mean))} sub={sub(summary.soldPrice, (v) => fmt.dkk(v === null ? null : Math.round(v)))} />
      <Kpi label={tx("Gns. udbudspris", "Avg. listing price")} value={fmt.dkk(mean(summary.askPrice) === null ? null : Math.round(summary.askPrice!.mean))} sub={sub(summary.askPrice, (v) => fmt.dkk(v === null ? null : Math.round(v)))} />
      <Kpi label={tx("Gns. liggetid", "Avg. time on market")} value={fmt.days(mean(summary.daysOnMarket) === null ? null : Math.round(summary.daysOnMarket!.mean))} sub={sub(summary.daysOnMarket, (v) => fmt.days(v === null ? null : Math.round(v)))} />
      <Kpi label={tx("Gns. boligareal", "Avg. living area")} value={fmt.sqm(mean(summary.areaSqm) === null ? null : Math.round(summary.areaSqm!.mean))} sub={sub(summary.areaSqm, (v) => fmt.sqm(v === null ? null : Math.round(v)))} />
      <Kpi label={tx("Gns. pris pr. m²", "Avg. price per m²")} value={fmt.dkk(mean(summary.pricePerSqm) === null ? null : Math.round(summary.pricePerSqm!.mean))} sub={sub(summary.pricePerSqm, (v) => fmt.dkk(v === null ? null : Math.round(v)))} />
      <Kpi label={tx("Salg i alt", "Sales")} value={fmt.int(summary.count)} sub={tx("efter valgt filter", "after the chosen filter")} />
    </dl>
  );
}

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import soldJson from "@shared/data/sold-properties.json" with { type: "json" };
import type { SoldProperty } from "@shared/types/sold";
import { SoldMap } from "@/components/sold/sold-map";
import { SoldSummaryCards } from "@/components/sold/sold-summary";
import { SoldTable } from "@/components/sold/sold-table";
import { useI18n } from "@/i18n/i18n";
import { makeSoldFormat } from "@/lib/sold-format";
import { SOLD_METRICS, applyFilter, summarize, toRows, type AreaFilter, type SoldMetric } from "@/lib/sold-stats";

const SALES = soldJson as SoldProperty[];
const ROWS = toRows(SALES);
const AREAS: Array<{ id: AreaFilter; da: string; en: string }> = [
  { id: "all", da: "Alle", en: "All" },
  { id: "kaerby", da: "Kærby", en: "Kærby" },
  { id: "gl-hasseris", da: "Gl. Hasseris", en: "Gl. Hasseris" },
];

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${active ? "border-cta bg-cta text-cta-text" : "border-border-strong bg-surface text-ink hover:bg-surface-hover"}`;

/** Houses sold in Kærby and Gl. Hasseris: averages, every sale, and a value heat map. State lives in the URL. */
export function SoldPage() {
  const { language } = useI18n();
  const tx = (da: string, en: string) => (language === "da" ? da : en);
  const fmt = useMemo(() => makeSoldFormat(language), [language]);
  const [params, setParams] = useSearchParams();

  const area: AreaFilter = params.get("omraade") === "kaerby" ? "kaerby" : params.get("omraade") === "gl-hasseris" ? "gl-hasseris" : "all";
  const excludeOutliers = params.get("afvigende") === "ekskl";
  const requested = params.get("kort");
  const [metric, setMetric] = useState<SoldMetric>(SOLD_METRICS.find((m) => m === requested) ?? "discountPct");

  const update = (key: string, value: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null) next.delete(key); else next.set(key, value);
      return next;
    }, { replace: true });

  const inArea = useMemo(() => applyFilter(ROWS, { area, excludeOutliers: false }), [area]);
  const counted = useMemo(() => applyFilter(ROWS, { area, excludeOutliers }), [area, excludeOutliers]);
  const summary = useMemo(() => summarize(counted), [counted]);
  const lookupAddresses = useMemo(() => ROWS.map((r) => r.address), []);
  const outlierCount = inArea.filter((r) => r.outlierReason !== null).length;
  const priced = inArea.filter((r) => r.soldPrice !== null).length;
  const dates = inArea.map((r) => r.soldDate).filter((d): d is string => d !== null).sort();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{tx("Solgte boliger", "Sold houses")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          {tx(
            `Villaer solgt i Kærby og Gl. Hasseris: ${ROWS.length} salg${dates.length ? ` (${fmt.date(dates[0]!)} – ${fmt.date(dates[dates.length - 1]!)})` : ""}, ${priced} med oplyst salgspris. Data er indlæst fra de to filer, du har leveret.`,
            `Houses sold in Kærby and Gl. Hasseris: ${ROWS.length} sales${dates.length ? ` (${fmt.date(dates[0]!)} – ${fmt.date(dates[dates.length - 1]!)})` : ""}, ${priced} with a known sold price. Loaded from the two files you supplied.`,
          )}
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div role="group" aria-label={tx("Område", "Area")} className="flex gap-1.5">
          {AREAS.map((a) => (
            <button key={a.id} type="button" aria-pressed={area === a.id} className={chip(area === a.id)} onClick={() => update("omraade", a.id === "all" ? null : a.id)}>{tx(a.da, a.en)}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={excludeOutliers} onChange={(e) => update("afvigende", e.target.checked ? "ekskl" : null)} className="h-4 w-4" />
          {tx(`Ekskl. afvigende salg (${outlierCount})`, `Exclude outlier sales (${outlierCount})`)}
        </label>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <section aria-labelledby="sold-summary-title" className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <h2 id="sold-summary-title" className="mb-3 text-lg font-bold tracking-tight">{tx("Gennemsnit", "Averages")}</h2>
          <SoldSummaryCards summary={summary} fmt={fmt} tx={tx} />
          <p className="mt-3 text-xs text-ink-soft">
            {tx(
              "Hvert gennemsnit bruger kun de salg, der har tallet (n under hvert tal). Afslag kan kun beregnes, hvor både udbudspris og salgspris kendes, og liggetid findes kun for Kærby. Afvigende salg (delsalg, nedrivningshuse, ruin) kan slås fra ovenfor, fordi de fylder meget i et gennemsnit.",
              "Each average uses only the sales that have that figure (n under each number). Discount needs both a listing and a sold price, and time on market exists only for Kærby. Outlier sales (part sales, teardowns, a ruin) can be switched off above because they weigh heavily in an average.",
            )}
          </p>
        </section>

        <SoldMap rows={counted} lookupAddresses={lookupAddresses} metric={metric} onMetricChange={(m) => { setMetric(m); update("kort", m); }} />

        <SoldTable rows={inArea} excludeOutliers={excludeOutliers} fmt={fmt} tx={tx} />
      </div>
    </div>
  );
}

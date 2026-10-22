import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  LAG_RANGE,
  MARKET_PHASES,
  STAT_SERIES_KEYS,
  analyzeRelationships,
  summarizePhases,
  type LeadLagResult,
  type StatSeriesKey,
} from "@shared/analysis/zip-market-relationships";
import { shiftMonth, zipMarketSnapshot } from "@shared/analysis/zip-market-stats";
import { useI18n } from "@/i18n/i18n";
import { makeStatsFormat } from "@/lib/stats-format";
import {
  STRENGTH_LABELS,
  buildPhaseRemarks,
  buildRelationshipRemarks,
  seriesLabel,
  seriesUnit,
} from "@/lib/zip-market-remarks";
import { buildSeasonality, buildStatsView, buildYearlyRows } from "@/lib/zip-market-view";
import { MarketTimeline, type TimelinePanel } from "@/components/stats/market-timeline";
import { KpiCard } from "@/components/stats/kpi-card";
import { CorrelationMatrix } from "@/components/stats/correlation-matrix";
import { DivergingBars } from "@/components/stats/diverging-bars";
import { RelationshipMap } from "@/components/stats/relationship-map";

type MatrixMode = "changes" | "annual";

export function StatsPage() {
  const { t, language } = useI18n();
  const tx = (da: string, en: string) => (language === "da" ? da : en);
  const f = useMemo(() => makeStatsFormat(language), [language]);

  const view = useMemo(buildStatsView, []);
  const yearly = useMemo(buildYearlyRows, []);
  const seasonality = useMemo(buildSeasonality, []);
  const report = useMemo(() => analyzeRelationships(), []);
  const summaries = useMemo(() => summarizePhases(), []);
  const phaseRemarks = useMemo(() => buildPhaseRemarks(language, summaries), [language, summaries]);
  const relationshipRemarks = useMemo(() => buildRelationshipRemarks(language, report), [language, report]);

  const [matrixMode, setMatrixMode] = useState<MatrixMode>("changes");
  const [leadIndex, setLeadIndex] = useState(0);

  useEffect(() => {
    const title = tx("Markedsstatistik 9000 Aalborg", "Market statistics 9000 Aalborg");
    document.title = `${title} | ${t("app.name")}`;
    return () => {
      document.title = t("app.name");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const labels = useMemo(
    () => Object.fromEntries(STAT_SERIES_KEYS.map((key) => [key, seriesLabel(key, language)])) as Record<StatSeriesKey, string>,
    [language],
  );
  const shortLabels: Record<StatSeriesKey, string> = {
    asking: tx("Udbudspris", "Asking price"),
    sold: tx("Salgspris", "Sold price"),
    supply: tx("Udbud", "Supply"),
    daysOnMarket: tx("Salgstid", "Days on market"),
    discount: tx("Afslag", "Discount"),
  };

  const panels: TimelinePanel[] = [
    {
      id: "price",
      title: tx("Pris pr. m²", "Price per m²"),
      unit: seriesUnit("sold", language),
      format: f.int,
      lines: [
        { id: "asking", label: tx("Udbud (villa)", "Asking (villa)"), points: view.series.asking, className: "text-brand", dashed: true },
        { id: "sold", label: tx("Solgt", "Sold"), points: view.series.sold, className: "text-ink" },
      ],
    },
    { id: "supply", title: labels.supply, unit: seriesUnit("supply", language), format: f.int, lines: [{ id: "supply", label: labels.supply, points: view.series.supply, className: "text-brand" }] },
    { id: "days", title: labels.daysOnMarket, unit: seriesUnit("daysOnMarket", language), format: f.int, lines: [{ id: "days", label: labels.daysOnMarket, points: view.series.daysOnMarket, className: "text-brand" }] },
    { id: "discount", title: labels.discount, unit: seriesUnit("discount", language), format: f.int, lines: [{ id: "discount", label: labels.discount, points: view.series.discount, className: "text-brand" }] },
  ];

  const phaseBands = phaseRemarks.map((remark) => {
    const phase = MARKET_PHASES.find((p) => p.id === remark.id)!;
    return { id: remark.id, number: remark.number, from: phase.from, to: phase.to, title: remark.title };
  });

  const lead: LeadLagResult = report.leadLag[leadIndex]!;
  const bestOf = (leader: StatSeriesKey, follower: StatSeriesKey) => report.leadLag.find((l) => l.leader === leader && l.follower === follower)!;
  const edgeLabel = (l: LeadLagResult) => `r ${f.corr(l.best?.r ?? null)}, ${Math.abs(l.best?.lag ?? 0)} ${tx("md.", "mo")}`;
  const sideEdge = (follower: StatSeriesKey) => {
    const l = bestOf("supply", follower);
    return `r ${f.corr(l.sameMonth.r)} ${tx("samme måned", "same month")}`;
  };

  const changeN = report.changeCorrelations[0]?.n ?? 0;
  const annualN = report.annualCorrelations[0]?.n ?? 0;

  const monthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(language === "da" ? "da-DK" : "en-GB", { month: "narrow", timeZone: "UTC" });
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(Date.UTC(2025, i, 1))));
  }, [language]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-8">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-text">{tx("Markedsstatistik", "Market statistics")}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{tx("Postnummer 9000 Aalborg", "Postcode 9000 Aalborg")}</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-soft">
          {tx(
            `Månedlige tal fra Boligsidens Markedsindeks, ${f.month(view.firstMonth)} til ${f.month(view.latestMonth)}: ${view.monthCount} måneder og fem serier. Siden viser, hvordan markedet har bevæget sig, og hvordan udbud, priser, salgstid og afslag hænger sammen.`,
            `Monthly figures from the Boligsiden Markedsindeks, ${f.month(view.firstMonth)} to ${f.month(view.latestMonth)}: ${view.monthCount} months and five series. The page shows how the market has moved and how supply, prices, days on market and discounts relate.`,
          )}
        </p>
        <p className="mt-3 max-w-3xl rounded-xl border border-border bg-surface-alt px-3.5 py-2.5 text-[12px] text-ink-soft" role="note">
          {tx(
            "Datasættet er et øjebliksbillede indsat manuelt. Hentetidspunktet kendes ikke, og kilden dokumenterer ikke alle definitioner. Se forbeholdene nederst.",
            "The data is a snapshot pasted in by hand. Its capture time is unknown and the source does not document every definition. See the caveats at the bottom.",
          )}
        </p>
      </header>

      <section aria-labelledby="kpi-heading" className="mb-10">
        <h2 id="kpi-heading" className="sr-only">{tx("Nøgletal", "Key figures")}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {view.kpis.map((kpi) => {
            const previousMonth = shiftMonth(view.latestMonth, -12);
            const absolute = kpi.absoluteChange;
            const atMax = kpi.max.month === view.latestMonth;
            const atMin = kpi.min.month === view.latestMonth;
            const standing = atMax
              ? tx("Højeste niveau i hele perioden", "Highest level in the whole period")
              : atMin
                ? tx("Laveste niveau i hele perioden", "Lowest level in the whole period")
                : tx(`Højere end ${Math.round(kpi.percentile)} % af månederne`, `Higher than ${Math.round(kpi.percentile)}% of months`);
            return (
              <KpiCard
                key={kpi.key}
                label={labels[kpi.key]}
                value={f.int(kpi.value)}
                unit={seriesUnit(kpi.key, language)}
                change={f.percent(kpi.percentChange)}
                changeCaption={`${absolute === null ? "" : `(${absolute > 0 ? "+" : ""}${f.int(absolute)}) `}${tx("ift.", "vs")} ${f.month(previousMonth)}`}
                standing={standing}
                range={tx(
                  `Spænd: ${f.int(kpi.min.value)} (${f.month(kpi.min.month)}) til ${f.int(kpi.max.value)} (${f.month(kpi.max.month)})`,
                  `Range: ${f.int(kpi.min.value)} (${f.month(kpi.min.month)}) to ${f.int(kpi.max.value)} (${f.month(kpi.max.month)})`,
                )}
                trend={kpi.trend}
                trendLabel={tx("De seneste 60 måneder", "The last 60 months")}
              />
            );
          })}
        </div>
      </section>

      <section aria-labelledby="timeline-heading" className="mb-12">
        <h2 id="timeline-heading" className="text-xl font-semibold tracking-tight">{tx("Udviklingen måned for måned", "Month by month")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          {tx(
            "Hold musen over eller træk en finger hen over diagrammerne for at aflæse en måned i alle fire serier. Tallene øverst markerer de otte faser, som er beskrevet herunder.",
            "Hover or drag a finger across the charts to read one month in all four series. The numbers along the top mark the eight phases described below.",
          )}
        </p>
        <div className="mt-4 rounded-2xl border border-border bg-surface p-3 shadow-card sm:p-5">
          <MarketTimeline
            panels={panels}
            months={view.months}
            phases={phaseBands}
            formatMonth={f.month}
            ariaLabel={tx("Fire tidsserier for postnummer 9000, januar 2011 til september 2026", "Four time series for postcode 9000, January 2011 to September 2026")}
            keyboardHint={tx("Tastatur: tryk på diagrammet og brug piletasterne. Shift hopper et år.", "Keyboard: focus the chart and use the arrow keys. Shift jumps a year.")}
            phasesLabel={tx("Faser", "Phases")}
          />
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          {tx(
            "Udbudsprisen gælder villaer. Salgsprisen, salgstiden og afslaget gælder villaer og rækkehuse.",
            "The asking price covers villas. The sold price, days on market and discount cover villas and terraced houses.",
          )}
        </p>
      </section>

      <section aria-labelledby="phases-heading" className="mb-12">
        <h2 id="phases-heading" className="text-xl font-semibold tracking-tight">{tx("Sådan har tallene ændret sig over tid", "How the numbers changed over time")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          {tx(
            "Otte faser, hver afgrænset af et vendepunkt i pris-serierne. Procenterne viser ændringen fra første til sidste måned i fasen.",
            "Eight phases, each bounded by a turning point in the price series. The percentages show the change from the first to the last month of the phase.",
          )}
        </p>
        <ol className="mt-5 grid gap-4 lg:grid-cols-2">
          {phaseRemarks.map((phase) => (
            <li key={phase.id} id={`phase-${phase.id}`} className="min-w-0 scroll-mt-24 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cta text-[12px] font-semibold text-cta-text" aria-hidden="true">{phase.number}</span>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold leading-snug text-ink">{phase.title}</h3>
                  <p className="text-[12px] text-ink-faint">{phase.period}</p>
                </div>
              </div>
              <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">{phase.body}</p>
              <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border pt-3 text-[12px] sm:grid-cols-3">
                {phase.changes.map((change) => (
                  <div key={change.key} className="min-w-0">
                    <dt className="truncate text-ink-faint">{shortLabels[change.key]}</dt>
                    <dd className="font-semibold tabular-nums text-ink">
                      <span aria-hidden="true" className="mr-1 text-ink-faint">{change.percent === null || change.percent === 0 ? "" : change.percent > 0 ? "▲" : "▼"}</span>
                      {change.text}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="yearly-heading" className="mb-12">
        <h2 id="yearly-heading" className="text-xl font-semibold tracking-tight">{tx("Årsoversigt", "Year by year")}</h2>
        <p className="mt-1 text-sm text-ink-soft">{tx("Gennemsnit af månedstal. Det nuværende år er ufuldstændigt.", "Averages of monthly figures. The current year is incomplete.")}</p>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
          <table className="w-full min-w-[640px] text-right text-[13px] tabular-nums">
            <caption className="sr-only">{tx("Årlige gennemsnit for postnummer 9000", "Yearly averages for postcode 9000")}</caption>
            <thead className="bg-surface-alt text-[11px] font-semibold text-ink-soft">
              <tr>
                <th scope="col" className="px-3 py-2.5 text-left">{tx("År", "Year")}</th>
                <th scope="col" className="px-3 py-2.5">{labels.sold}</th>
                <th scope="col" className="px-3 py-2.5">{tx("Ændring", "Change")}</th>
                <th scope="col" className="px-3 py-2.5">{labels.asking}</th>
                <th scope="col" className="px-3 py-2.5">{labels.supply}</th>
                <th scope="col" className="px-3 py-2.5">{labels.daysOnMarket}</th>
                <th scope="col" className="px-3 py-2.5">{labels.discount}</th>
              </tr>
            </thead>
            <tbody>
              {yearly.map((row) => (
                <tr key={row.year} className="border-t border-border">
                  <th scope="row" className="px-3 py-2 text-left font-semibold">
                    {row.year}
                    {row.partial && <span className="ml-1.5 text-[11px] font-normal text-ink-faint">({row.months} {tx("md.", "mo")})</span>}
                  </th>
                  <td className="px-3 py-2">{f.int(row.values.sold)}</td>
                  <td className="px-3 py-2 text-ink-soft">{f.percent(row.soldChangePercent)}</td>
                  <td className="px-3 py-2">{f.int(row.values.asking)}</td>
                  <td className="px-3 py-2">{f.int(row.values.supply)}</td>
                  <td className="px-3 py-2">{f.int(row.values.daysOnMarket)}</td>
                  <td className="px-3 py-2">{f.int(row.values.discount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="relations-heading" className="mb-12">
        <h2 id="relations-heading" className="text-xl font-semibold tracking-tight">{tx("Hvordan påvirker tallene hinanden?", "How do the series affect each other?")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          {tx(
            "Sammenhængene er målt på ændringer over 12 måneder, ikke på niveauer. Niveauerne følger alle den samme lange opgang og ser derfor mere sammenhængende ud, end de er. Tallene beskriver, hvad der er hændt sammen, ikke hvad der er årsag til hvad.",
            "Relationships are measured on 12-month changes, not on levels. All levels share the same long upward trend and so look more connected than they are. The numbers describe what happened together, not what caused what.",
          )}
        </p>

        <div className="mt-5 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
          <h3 className="mb-4 text-[14px] font-semibold">{tx("Det mest konsistente mønster i data", "The most consistent pattern in the data")}</h3>
          <RelationshipMap
            chain={[
              { id: "supply", label: labels.supply },
              { id: "asking", label: shortLabels.asking },
              { id: "sold", label: shortLabels.sold },
            ]}
            chainEdges={[
              { from: "supply", to: "asking", label: edgeLabel(bestOf("supply", "asking")) },
              { from: "asking", to: "sold", label: edgeLabel(bestOf("asking", "sold")) },
            ]}
            side={[
              { node: { id: "days", label: shortLabels.daysOnMarket }, edge: { from: "supply", to: "days", label: sideEdge("daysOnMarket") } },
              { node: { id: "discount", label: shortLabels.discount }, edge: { from: "supply", to: "discount", label: sideEdge("discount") } },
            ]}
            caption={tx(
              "Pilene viser, hvilken serie der kommer først, og den stærkeste korrelation med tilhørende forsinkelse i måneder. Mere udbud går sammen med lavere udbudspriser, og ændringer i udbudsprisen går forud for ændringer i salgsprisen.",
              "Arrows show which series comes first, with the strongest correlation and its delay in months. More supply goes with lower asking prices, and changes in the asking price come before changes in the sold price.",
            )}
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[14px] font-semibold">{tx("Korrelationsmatrix", "Correlation matrix")}</h3>
              <div role="group" aria-label={tx("Vælg grundlag", "Choose basis")} className="inline-flex rounded-lg border border-border p-0.5 text-[12px]">
                {(["changes", "annual"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={matrixMode === mode}
                    onClick={() => setMatrixMode(mode)}
                    className={`min-h-8 rounded-md px-2.5 font-medium transition-colors ${matrixMode === mode ? "bg-cta text-cta-text" : "text-ink-soft hover:bg-surface-alt"}`}
                  >
                    {mode === "changes" ? tx("12-mdr.-ændringer", "12-month changes") : tx("Årsgennemsnit", "Annual averages")}
                  </button>
                ))}
              </div>
            </div>
            <p className="mb-3 mt-1 text-[12px] text-ink-faint">
              {matrixMode === "changes"
                ? tx(`${changeN} månedlige observationer, men overlappende vinduer gør dem langt fra uafhængige.`, `${changeN} monthly observations, but overlapping windows make them far from independent.`)
                : tx(`${annualN} hele år. Få punkter, men uden overlap, så et godt kontroltal.`, `${annualN} full years. Few points, but no overlap, so a good cross-check.`)}
            </p>
            <CorrelationMatrix
              keys={[...STAT_SERIES_KEYS]}
              pairs={matrixMode === "changes" ? report.changeCorrelations : report.annualCorrelations}
              labels={shortLabels}
              format={f.corr}
              caption={tx("Korrelation mellem de fem serier", "Correlation between the five series")}
            />
            <p className="mt-3 text-[11px] text-ink-faint">
              {tx("Brun: de bevæger sig sammen. Grå: de bevæger sig modsat. Tallet er altid vist.", "Brown: they move together. Grey: they move opposite ways. The number is always shown.")}
            </p>
          </div>

          <div className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
            <h3 className="text-[14px] font-semibold">{tx("Hvem kommer først?", "Who comes first?")}</h3>
            <label className="mt-2 block text-[12px] text-ink-faint" htmlFor="lead-pair">{tx("Vælg par", "Choose a pair")}</label>
            <select
              id="lead-pair"
              value={leadIndex}
              onChange={(event) => setLeadIndex(Number(event.target.value))}
              className="mt-1 min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"
            >
              {report.leadLag.map((pair, index) => (
                <option key={`${pair.leader}-${pair.follower}`} value={index}>
                  {shortLabels[pair.leader]} → {shortLabels[pair.follower]}
                </option>
              ))}
            </select>
            <div className="mt-3">
              <DivergingBars
                bars={lead.profile.map((point) => ({ label: point.lag > 0 ? `+${point.lag}` : String(point.lag), value: point.r, emphasize: point.lag === lead.best?.lag }))}
                maxAbs={1}
                format={f.corr}
                labelEvery={3}
                ariaLabel={tx(
                  `Korrelation mellem ${shortLabels[lead.leader]} og ${shortLabels[lead.follower]} ved forskellige forsinkelser`,
                  `Correlation between ${shortLabels[lead.leader]} and ${shortLabels[lead.follower]} at different lags`,
                )}
              />
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
              {lead.best && (
                <>
                  {tx(
                    `Stærkest ved ${lead.best.lag > 0 ? "+" : ""}${lead.best.lag} måneder (r ${f.corr(lead.best.r)}). I samme måned: ${f.corr(lead.sameMonth.r)}. `,
                    `Strongest at ${lead.best.lag > 0 ? "+" : ""}${lead.best.lag} months (r ${f.corr(lead.best.r)}). Same month: ${f.corr(lead.sameMonth.r)}. `,
                  )}
                  {lead.best.lag > 0
                    ? tx(`Positive måneder betyder, at ${shortLabels[lead.follower].toLowerCase()} følger efter ${shortLabels[lead.leader].toLowerCase()}.`, `Positive months mean ${shortLabels[lead.follower].toLowerCase()} follows ${shortLabels[lead.leader].toLowerCase()}.`)
                    : lead.best.lag < 0
                      ? tx(`Negative måneder betyder, at ${shortLabels[lead.leader].toLowerCase()} følger efter ${shortLabels[lead.follower].toLowerCase()}.`, `Negative months mean ${shortLabels[lead.leader].toLowerCase()} follows ${shortLabels[lead.follower].toLowerCase()}.`)
                      : ""}
                </>
              )}
            </p>
            <p className="mt-1 text-[11px] text-ink-faint">
              {tx(
                `Vandret: måneder mellem ${shortLabels[lead.leader].toLowerCase()} og ${shortLabels[lead.follower].toLowerCase()} (fra ${LAG_RANGE[0]} til +${LAG_RANGE[LAG_RANGE.length - 1]}). Lodret: korrelation fra −1 til +1.`,
                `Horizontal: months between ${shortLabels[lead.leader].toLowerCase()} and ${shortLabels[lead.follower].toLowerCase()} (from ${LAG_RANGE[0]} to +${LAG_RANGE[LAG_RANGE.length - 1]}). Vertical: correlation from −1 to +1.`,
              )}
            </p>
          </div>
        </div>

        <ul className="mt-5 grid gap-4 lg:grid-cols-2">
          {relationshipRemarks.map((remark) => (
            <li key={remark.id} className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <h3 className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-ink">{remark.title}</h3>
                {remark.strength && (
                  <span className="shrink-0 rounded-full bg-surface-alt px-2.5 py-0.5 text-[11px] font-semibold text-ink-soft" title={tx("Den svageste af de to korrelationer, der understøtter pointen", "The weaker of the two correlations that support the point")}>
                    {STRENGTH_LABELS[remark.strength][language]}
                  </span>
                )}
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">{remark.body}</p>
              <p className="mt-3 border-t border-border pt-2.5 text-[12px] tabular-nums text-ink-faint">{remark.evidence}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="season-heading" className="mb-12">
        <h2 id="season-heading" className="text-xl font-semibold tracking-tight">{tx("Sæsonmønster", "Seasonal pattern")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          {tx(
            "Hver måneds gennemsnitlige afvigelse fra sit eget års gennemsnit, målt over hele år. Salgstiden er længst om vinteren og kortest sidst på sommeren. Udbuddet er lavest om vinteren og højest i sommerhalvåret. Salgsprisen svinger mindst, men er lidt højere sidst på året.",
            "Each month's average deviation from its own year's average, over full years only. Days on market are longest in winter and shortest in late summer. Supply is lowest in winter and highest in the summer half. The sold price varies least, but is somewhat higher late in the year.",
          )}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {seasonality.map((row) => {
            const peak = Math.max(...row.deviations.map(Math.abs));
            const top = row.deviations.indexOf(Math.max(...row.deviations));
            const bottom = row.deviations.indexOf(Math.min(...row.deviations));
            return (
              <figure key={row.key} className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-card">
                <figcaption className="mb-2 text-[13px] font-semibold">{labels[row.key]}</figcaption>
                <DivergingBars
                  bars={row.deviations.map((value, i) => ({ label: monthNames[i]!, value, emphasize: i === top || i === bottom }))}
                  maxAbs={Math.ceil(peak / 5) * 5 || 5}
                  format={(value) => f.percent(value)}
                  ariaLabel={tx(`Sæsonafvigelse for ${labels[row.key]}`, `Seasonal deviation for ${labels[row.key]}`)}
                />
              </figure>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="caveats-heading" className="mb-4">
        <h2 id="caveats-heading" className="text-xl font-semibold tracking-tight">{tx("Metode og forbehold", "Method and caveats")}</h2>
        <ul className="mt-3 grid max-w-4xl list-disc gap-2 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
          <li>
            {tx(
              `Kilden er Boligsidens Markedsindeks for postnummer ${zipMarketSnapshot.source.locationName}. Datasættet er indsat manuelt og er ikke hentet af en importer. Hentetidspunktet kendes ikke.`,
              `The source is the Boligsiden Markedsindeks for postcode ${zipMarketSnapshot.source.locationName}. The data was pasted in by hand, not fetched by an importer. Its capture time is unknown.`,
            )}
          </li>
          <li>
            {tx(
              "Udbudsprisen og udbuddet gælder kun villaer. Salgsprisen, salgstiden og afslaget gælder villaer og rækkehuse. Derfor sammenlignes niveauerne ikke direkte, kun ændringerne.",
              "The asking price and supply cover villas only. The sold price, days on market and discount cover villas and terraced houses. That is why levels are not compared directly, only changes.",
            )}
          </li>
          <li>
            {tx(
              "Der er ingen antal handler pr. måned. Salgsprisen er derfor støjende, og en enkelt måned kan skyldes sammensætningen af de solgte boliger.",
              "There are no sales counts per month. The sold price is therefore noisy, and a single month may reflect the mix of homes sold.",
            )}
          </li>
          <li>
            {tx(
              "Enheden for salgstid (dage) er udledt af navnet. Kilden forklarer ikke, hvordan afslaget beregnes. Afslaget vises her som en positiv størrelse (kilden bruger negative tal).",
              "The unit of days on market (days) is inferred from the name. The source does not explain how the discount is calculated. The discount is shown here as a positive size (the source uses negative numbers).",
            )}
          </li>
          <li>
            {tx(
              "Fund om, hvem der kommer først, er statistisk forrang og ikke bevis for årsag. Forhold som renter, indkomster og nybyggeri er ikke i datasættet og kan ligge bag flere serier på én gang.",
              "Findings about who comes first are statistical precedence, not proof of cause. Factors such as interest rates, incomes and new construction are not in the data and may sit behind several series at once.",
            )}
          </li>
          <li>
            {tx(
              `12-måneders ændringer overlapper, så de ${changeN} observationer svarer til langt færre uafhængige. Den bedste forsinkelse er valgt blandt ${LAG_RANGE.length}, hvilket gør den bedste korrelation lidt for optimistisk. Derfor vises både delperioder og årsgennemsnit.`,
              `12-month changes overlap, so the ${changeN} observations are worth far fewer independent ones. The best lag is picked from ${LAG_RANGE.length}, which makes the best correlation somewhat optimistic. That is why sub-periods and annual averages are shown too.`,
            )}
          </li>
          <li>
            {tx(
              "Postnummerets salgspris ligger 1,2 til 1,6 gange over kommuneserien i Markedsindekset. Tjek mod det live indeks, før de to sammenlignes.",
              "The postcode sold price runs 1.2 to 1.6 times the municipal series in the Markedsindeks. Check against the live index before comparing the two.",
            )}
          </li>
        </ul>
        <p className="mt-4 text-[12px] text-ink-faint">
          {tx("Fuld beskrivelse af serierne og beregningerne: ", "Full description of the series and calculations: ")}
          <code className="rounded bg-surface-alt px-1.5 py-0.5">docs/zip-9000-market-stats.md</code>
          {" · "}
          <Link to="/" className="underline underline-offset-2 hover:text-ink">{tx("Tilbage til søgning", "Back to search")}</Link>
        </p>
      </section>
    </div>
  );
}

import { useId, useState } from "react";
import snapshot from "@shared/data/boligsiden-market-index.json";
import { useI18n } from "@/i18n/i18n";
import { compareMarketMonths, marketChartSegments, type MarketComparisonMonth } from "@/lib/market-index";
import { inputClass, Panel, useResearchText } from "./fields";

const country = snapshot.series.find(series => series.locationType === "country");
const municipalities = snapshot.series.filter(series => series.locationType === "municipality")
  .sort((a, b) => a.locationName.localeCompare(b.locationName, "da"));

function IndexChart({ rows, municipality, formatMonth, formatValue }: {
  rows: MarketComparisonMonth[];
  municipality: string | null;
  formatMonth: (month: string) => string;
  formatValue: (value: number | null) => string;
}) {
  const tx = useResearchText(), id = useId();
  const width = 840, height = 300;
  const left = 70, right = 22, top = 28, bottom = 45;
  const values = rows.flatMap(row => [row.country, ...(municipality ? [row.municipality] : [])])
    .filter((value): value is number => value !== null);
  if (!values.length) return <p className="py-6 text-sm text-ink-soft">{tx("Ingen offentliggjorte værdier i dette udvalg.", "No published values for this selection.")}</p>;
  const maxValue = Math.max(...values, 1);
  const magnitude = 10 ** Math.floor(Math.log10(maxValue));
  const step = Math.ceil(maxValue / 4 / (magnitude / 5)) * (magnitude / 5);
  const ceiling = step * 4;
  const x = (index: number) => left + (rows.length === 1 ? .5 : index / (rows.length - 1)) * (width - left - right);
  const y = (value: number) => height - bottom - value / ceiling * (height - top - bottom);
  const monthTicks = [...new Set([0, Math.round((rows.length - 1) / 3), Math.round((rows.length - 1) * 2 / 3), rows.length - 1])];
  const lines = [{ field: "country" as const, name: tx("Danmark", "Denmark"), color: "text-brand", dashed: !!municipality },
    ...(municipality ? [{ field: "municipality" as const, name: municipality, color: "text-ink", dashed: false }] : [])];

  return <figure className="mt-5">
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs" aria-hidden="true">{lines.map(line => <span className="inline-flex items-center gap-2" key={line.field}>
      <svg width="26" height="8" className={line.color}><line x1="0" y1="4" x2="26" y2="4" stroke="currentColor" strokeWidth="2.5" strokeDasharray={line.dashed ? "5 3" : undefined} /></svg>{line.name}
    </span>)}</div>
    <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label={tx("Diagram med månedlige salgspriser. Rul vandret på små skærme.", "Monthly sale price chart. Scroll horizontally on small screens.")}>
    <svg className="h-auto w-full min-w-[640px]" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
      <title id={`${id}-title`}>{tx("Historiske salgspriser pr. m²", "Historical sale prices per m²")} · {municipality ? `${municipality} / ${tx("Danmark", "Denmark")}` : tx("Danmark", "Denmark")}</title>
      <desc id={`${id}-description`}>{tx("Månedlige gennemsnit for villaer og rækkehuse. Danmark vises", "Monthly averages for detached and terraced houses. Denmark is shown")}{municipality ? tx(" med stiplet linje og kommunen med fuld linje.", " with a dashed line and the municipality with a solid line.") : tx(" med fuld linje.", " with a solid line.")} {tx("Manglende værdier vises som huller. Alle tal findes i tabellen nedenfor.", "Missing values appear as gaps. All values are available in the table below.")}</desc>
      <text x={left} y="14" className="fill-current text-ink-soft" fontSize="13">{tx("kr./m²", "DKK/m²")}</text>
      {[0, 1, 2, 3, 4].map(tick => <g key={tick}>
        <line x1={left} x2={width - right} y1={y(tick * step)} y2={y(tick * step)} stroke="currentColor" className="text-border" />
        <text x={left - 10} y={y(tick * step) + 4} textAnchor="end" className="fill-current text-ink-soft" fontSize="13">{formatValue(tick * step)}</text>
      </g>)}
      {monthTicks.map(index => <text key={index} x={x(index)} y={height - 15} textAnchor={index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle"} className="fill-current text-ink-soft" fontSize="13">{formatMonth(rows[index]!.month)}</text>)}
      {lines.map(line => <g key={line.field} className={line.color}>
        {marketChartSegments(rows, line.field).map((segment, index) => <g key={index}>
          <path d={segment.map((point, i) => `${i ? "L" : "M"}${x(point.index)},${y(point.value)}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray={line.dashed ? "7 5" : undefined} strokeLinejoin="round" />
          {segment.map(point => <circle key={point.month} cx={x(point.index)} cy={y(point.value)} r="3" fill="currentColor" fillOpacity={segment.length === 1 ? 1 : 0}><title>{line.name} · {formatMonth(point.month)}: {formatValue(point.value)} {tx("kr./m²", "DKK/m²")}</title></circle>)}
        </g>)}
      </g>)}
    </svg>
    </div>
    <figcaption className="text-xs text-ink-soft">{tx("Månedlige, offentliggjorte gennemsnit · villaer og rækkehuse · kr./m²", "Published monthly averages · detached and terraced houses · DKK/m²")}</figcaption>
  </figure>;
}

export function MarketIndex() {
  const tx = useResearchText(), { language } = useI18n(), selectorId = useId();
  const [selection, setSelection] = useState("");
  const municipality = municipalities.find(series => series.locationName === selection);
  const rows = compareMarketMonths(country?.points ?? [], municipality?.points ?? []);
  const latest = rows[rows.length - 1];
  const locale = language === "da" ? "da-DK" : "en-GB";
  const formatValue = (value: number | null) => value === null ? tx("Ukendt", "Unknown") : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
  const formatMonth = (month: string) => new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  const unit = tx("kr./m²", "DKK/m²");
  const difference = latest && latest.country !== null && latest.country > 0 && latest.municipality !== null
    ? (latest.municipality / latest.country - 1) * 100 : null;
  const capturedDate = snapshot.source.capturedAt.slice(0, 10);

  return <div className="mb-6" data-testid="market-index"><Panel title={tx("Sammenlign tal for områder i Danmark", "Compare figures for areas in Denmark")}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl"><p className="text-sm text-ink-soft">{tx("Boligsidens Markedsindeks: salgspris pr. m² for villaer og rækkehuse. Historiske månedstal giver et overblik over områdets marked; de er ikke en vurdering af en bestemt bolig.", "Boligsiden Market Index: sale price per m² for detached and terraced houses. Historical monthly figures describe the area's market; they are not a valuation of an individual home.")}</p>
        <p className="mt-2 text-xs text-ink-soft">{tx("Gemt dataudtræk", "Saved data snapshot")} · {tx("hentet", "captured")} <time dateTime={snapshot.source.capturedAt}>{capturedDate}</time> · {tx("opdateres ikke automatisk", "does not update automatically")}</p></div>
      <label htmlFor={selectorId} className="block w-full text-sm font-semibold text-ink-soft sm:w-64">{tx("Vælg område", "Select an area")}
        <select id={selectorId} className={inputClass} value={selection} onChange={event => setSelection(event.target.value)}>
          <option value="">{tx("Danmark", "Denmark")}</option>
          {municipalities.map(series => <option key={series.locationName} value={series.locationName}>{series.locationName}</option>)}
        </select>
      </label>
    </div>
    {latest && <div className="mt-5 grid gap-3 sm:grid-cols-3" aria-live="polite">
      <div className="rounded-xl bg-surface-alt p-4"><p className="text-xs text-ink-soft">{tx("Danmark", "Denmark")} · {formatMonth(latest.month)}</p><p className="mt-1 text-2xl font-bold tabular-nums">{formatValue(latest.country)}{latest.country !== null && <span className="ml-1 text-sm font-normal">{unit}</span>}</p></div>
      {municipality && <><div className="rounded-xl bg-surface-alt p-4"><p className="text-xs text-ink-soft">{municipality.locationName} · {formatMonth(latest.month)}</p><p className="mt-1 text-2xl font-bold tabular-nums">{formatValue(latest.municipality)}{latest.municipality !== null && <span className="ml-1 text-sm font-normal">{unit}</span>}</p></div>
        <div className="rounded-xl bg-surface-alt p-4"><p className="text-xs text-ink-soft">{tx("Forskel fra Danmark i samme måned", "Difference from Denmark in the same month")}</p><p className="mt-1 text-2xl font-bold tabular-nums">{difference === null ? tx("Ukendt", "Unknown") : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(difference / 100)}</p></div></>}
    </div>}
    <IndexChart rows={rows} municipality={municipality?.locationName ?? null} formatMonth={formatMonth} formatValue={formatValue} />
    <details className="mt-5 rounded-xl border border-border p-3">
      <summary className="cursor-pointer text-sm font-semibold">{tx("Se alle månedstal", "View all monthly values")} ({rows.length})</summary>
      <div className="mt-3 max-h-96 overflow-auto" tabIndex={0} role="region" aria-label={tx("Tabel med månedlige salgspriser", "Table of monthly sale prices")}>
        <table className="w-full text-left text-sm tabular-nums"><caption className="pb-3 text-left text-xs text-ink-soft">{tx("Salgspris pr. m² · villaer og rækkehuse. Ukendt betyder, at der ikke er en værdi i dataudtrækket.", "Sale price per m² · detached and terraced houses. Unknown means the snapshot contains no value.")}</caption>
          <thead className="sticky top-0 bg-surface"><tr className="border-b border-border"><th scope="col" className="p-2">{tx("Måned", "Month")}</th><th scope="col" className="p-2 text-right">{tx("Danmark", "Denmark")} ({unit})</th>{municipality && <th scope="col" className="p-2 text-right">{municipality.locationName} ({unit})</th>}</tr></thead>
          <tbody>{[...rows].reverse().map(row => <tr key={row.month} className="border-b border-border"><th scope="row" className="p-2 font-normal"><time dateTime={row.month}>{formatMonth(row.month)}</time></th><td className="p-2 text-right">{formatValue(row.country)}</td>{municipality && <td className="p-2 text-right">{formatValue(row.municipality)}</td>}</tr>)}</tbody>
        </table>
      </div>
    </details>
    <p className="mt-4 text-xs text-ink-soft">{tx("Kilde", "Source")}: <a href={snapshot.source.url} target="_blank" rel="noopener noreferrer" className="underline">{snapshot.source.name} ↗</a> · {tx("Se kilden for metode og nyere tal.", "See the source for methodology and newer figures.")}</p>
  </Panel></div>;
}

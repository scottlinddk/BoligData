import { useEffect, useMemo, useRef, useState } from "react";
import type { SparHistoryPoint } from "@shared/types/spar";
import { formatDkk } from "@shared/utils/price";
import { useI18n } from "@/i18n/i18n";
import { formatMillions, formatPeriod } from "@/lib/smart-estimate";

interface EstimateChartProps {
  history: SparHistoryPoint[];
  askingPrice: number | null;
  height?: number;
}

const MARGIN = { top: 14, right: 14, bottom: 30, left: 58 };

function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => setWidth(Math.round(entries[0]?.contentRect.width ?? 0)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Round tick values spanning [min, max]: steps of 1, 2 or 5 times a power of ten. */
function niceTicks(min: number, max: number, target = 6): number[] {
  const raw = (max - min) / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(n => n * magnitude).find(s => s >= raw * 0.75) ?? raw;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) ticks.push(v);
  return ticks;
}

/**
 * Fair-price level over time with its 80 % band. The line is today's valuation re-priced with each
 * month's market level, so it shows market movement, not this home's own history. Months that are
 * still being revised are dashed.
 */
export function EstimateChart({ history, askingPrice, height = 260 }: EstimateChartProps) {
  const { language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const [wrapper, width] = useElementWidth();
  const [active, setActive] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (history.length < 2 || width < 120) return null;
    const lows = history.map(p => p.lo80), highs = history.map(p => p.hi80);
    let min = Math.min(...lows), max = Math.max(...highs);
    if (askingPrice !== null) { min = Math.min(min, askingPrice); max = Math.max(max, askingPrice); }
    const pad = (max - min) * 0.06;
    min -= pad; max += pad;
    const ticks = niceTicks(min, max);
    const innerW = width - MARGIN.left - MARGIN.right, innerH = height - MARGIN.top - MARGIN.bottom;
    const x = (i: number) => MARGIN.left + (i / (history.length - 1)) * innerW;
    const y = (v: number) => MARGIN.top + (1 - (v - min) / (max - min)) * innerH;
    const firstPreliminary = history.findIndex(p => p.preliminary);
    const solidEnd = firstPreliminary === -1 ? history.length - 1 : Math.max(firstPreliminary - 1, 0);
    const path = (from: number, to: number) => history.slice(from, to + 1).map((p, k) => `${k === 0 ? "M" : "L"}${x(from + k).toFixed(1)},${y(p.estimate).toFixed(1)}`).join(" ");
    const band = `${history.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.hi80).toFixed(1)}`).join(" ")} ${history.map((_, i) => { const j = history.length - 1 - i; return `L${x(j).toFixed(1)},${y(history[j]!.lo80).toFixed(1)}`; }).join(" ")} Z`;
    // One label per January, plus the first month when the series starts mid-year and is short.
    const xTicks = history.flatMap((p, i) => p.period.endsWith("-01") ? [{ i, label: p.period.slice(0, 4) }] : []);
    if (xTicks.length === 0) xTicks.push({ i: 0, label: formatPeriod(history[0]!.period, language) });
    return { ticks, x, y, innerW, innerH, band, solid: path(0, solidEnd), tail: solidEnd < history.length - 1 ? path(solidEnd, history.length - 1) : null, xTicks };
  }, [history, askingPrice, width, height, language]);

  const last = history[history.length - 1];
  const summary = last ? tx(
    `Fair pris over tid: ${formatDkk(Math.round(history[0]!.estimate))} i ${formatPeriod(history[0]!.period, language)} til ${formatDkk(Math.round(last.estimate))} i ${formatPeriod(last.period, language)}.`,
    `Fair price over time: ${formatDkk(Math.round(history[0]!.estimate))} in ${formatPeriod(history[0]!.period, language)} to ${formatDkk(Math.round(last.estimate))} in ${formatPeriod(last.period, language)}.`) : "";

  function pick(clientX: number, rect: DOMRect) {
    if (!geometry) return;
    const ratio = (clientX - rect.left - MARGIN.left) / geometry.innerW;
    setActive(Math.min(history.length - 1, Math.max(0, Math.round(ratio * (history.length - 1)))));
  }

  const shown = active === null ? null : history[active]!;
  return <div ref={wrapper} className="relative w-full" style={{ height }}>
    {geometry && <svg width={width} height={height} role="img" aria-label={summary} tabIndex={0}
      onPointerMove={event => pick(event.clientX, event.currentTarget.getBoundingClientRect())}
      onPointerLeave={() => setActive(null)} onBlur={() => setActive(null)}
      onKeyDown={event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        setActive(current => Math.min(history.length - 1, Math.max(0, (current ?? history.length - 1) + (event.key === "ArrowRight" ? 1 : -1))));
      }}
      className="touch-pan-y rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
      {geometry.ticks.map(tick => <g key={tick}>
        <line x1={MARGIN.left} x2={width - MARGIN.right} y1={geometry.y(tick)} y2={geometry.y(tick)} stroke="var(--color-border)" strokeDasharray="3 4" />
        <text x={MARGIN.left - 8} y={geometry.y(tick)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="var(--color-text-secondary)">{formatMillions(tick, language)}</text>
      </g>)}
      {geometry.xTicks.map(tick => <text key={tick.i} x={geometry.x(tick.i)} y={height - 9} textAnchor="middle" fontSize="11" fill="var(--color-text-secondary)">{tick.label}</text>)}
      <path d={geometry.band} fill="var(--color-brand)" opacity="0.14" />
      {askingPrice !== null && <g>
        <line x1={MARGIN.left} x2={width - MARGIN.right} y1={geometry.y(askingPrice)} y2={geometry.y(askingPrice)} stroke="var(--color-brand)" strokeWidth="1.5" strokeDasharray="6 4" />
        <text x={MARGIN.left + 6} y={geometry.y(askingPrice) - 6} textAnchor="start" fontSize="11" fontWeight="600" fill="var(--color-brand-text)" stroke="var(--color-surface)" strokeWidth="3" paintOrder="stroke">{tx("Udbudspris", "Asking price")}</text>
      </g>}
      <path d={geometry.solid} fill="none" stroke="var(--color-text-primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {geometry.tail && <path d={geometry.tail} fill="none" stroke="var(--color-text-primary)" strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" />}
      {last && <circle cx={geometry.x(history.length - 1)} cy={geometry.y(last.estimate)} r="4.5" fill="var(--color-text-primary)" stroke="var(--color-surface)" strokeWidth="2" />}
      {active !== null && shown && <g pointerEvents="none">
        <line x1={geometry.x(active)} x2={geometry.x(active)} y1={MARGIN.top} y2={height - MARGIN.bottom} stroke="var(--color-border-strong)" />
        <circle cx={geometry.x(active)} cy={geometry.y(shown.estimate)} r="5" fill="var(--color-surface)" stroke="var(--color-text-primary)" strokeWidth="2" />
      </g>}
    </svg>}
    {geometry && active !== null && shown && <div role="status" className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-cta px-3 py-2 text-xs text-cta-text shadow-lift"
      style={{ left: Math.min(Math.max(geometry.x(active), 80), width - 80) }}>
      <span className="block font-semibold">{formatDkk(Math.round(shown.estimate))}</span>
      <span className="block opacity-70">{formatPeriod(shown.period, language)}{shown.preliminary ? ` · ${tx("foreløbig", "preliminary")}` : ""}</span>
    </div>}
  </div>;
}

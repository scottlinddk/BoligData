import { linearScale, niceTicks } from "@/lib/chart-scale";

interface HistoryPoint { month: string; value: number }
interface ForecastChartPoint { month: string; value: number; lo: number; hi: number }

interface ForecastChartProps {
  history: HistoryPoint[];
  forecast: ForecastChartPoint[];
  ariaLabel: string;
  historyLabel: string;
  forecastLabel: string;
  rangeLabel: string;
  formatValue: (value: number) => string;
  formatMonth: (month: string) => string;
}

const W = 760;
const H = 300;
const PAD = { l: 56, r: 14, t: 14, b: 30 };

/** History (solid), forecast (dashed) and its backtest range (shaded). One panel, shared y axis from zero-free min to max. */
export function ForecastChart({ history, forecast, ariaLabel, historyLabel, forecastLabel, rangeLabel, formatValue, formatMonth }: ForecastChartProps) {
  const all = [...history, ...forecast];
  if (history.length === 0 || forecast.length === 0) return null;
  const values = [...history.map((p) => p.value), ...forecast.flatMap((p) => [p.lo, p.hi])];
  const ticks = niceTicks(Math.min(...values), Math.max(...values), 4);
  const y = linearScale([ticks[0]!, ticks[ticks.length - 1]!], [H - PAD.b, PAD.t]);
  const x = linearScale([0, all.length - 1], [PAD.l, W - PAD.r]);
  const line = (points: { value: number }[], offset: number) => points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i + offset).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const offset = history.length;
  const bandTop = forecast.map((p, i) => `${x(i + offset).toFixed(1)} ${y(p.hi).toFixed(1)}`);
  const bandBottom = forecast.map((p, i) => `${x(i + offset).toFixed(1)} ${y(p.lo).toFixed(1)}`).reverse();
  const joinFromLast = `M${x(offset - 1).toFixed(1)} ${y(history[history.length - 1]!.value).toFixed(1)} ${forecast.map((p, i) => `L${x(i + offset).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ")}`;
  const labelIndexes = [0, Math.floor((all.length - 1) / 2), all.length - 1];

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="block h-auto w-full text-ink-soft">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={0.15} />
            <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="currentColor">{formatValue(t)}</text>
          </g>
        ))}
        <line x1={x(offset - 0.5)} x2={x(offset - 0.5)} y1={PAD.t} y2={H - PAD.b} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="3 3" />
        <path d={`M${bandTop.join(" L")} L${bandBottom.join(" L")} Z`} className="fill-brand" fillOpacity={0.14} />
        <path d={line(history, 0)} fill="none" stroke="currentColor" strokeWidth={1.6} className="text-ink" />
        <path d={joinFromLast} fill="none" strokeWidth={2} strokeDasharray="5 3" className="stroke-brand" />
        {labelIndexes.map((i) => (
          <text key={i} x={x(i)} y={H - 10} textAnchor={i === 0 ? "start" : i === all.length - 1 ? "end" : "middle"} fontSize={10} fill="currentColor">{formatMonth(all[i]!.month)}</text>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-soft">
        <span><span aria-hidden className="mr-1 inline-block h-0.5 w-4 translate-y-[-3px] bg-ink" />{historyLabel}</span>
        <span><span aria-hidden className="mr-1 inline-block h-0.5 w-4 translate-y-[-3px] border-t-2 border-dashed border-brand" />{forecastLabel}</span>
        <span><span aria-hidden className="mr-1 inline-block h-3 w-4 translate-y-[2px] rounded-sm bg-brand/20" />{rangeLabel}</span>
      </figcaption>
    </figure>
  );
}

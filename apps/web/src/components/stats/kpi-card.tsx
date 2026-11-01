import type { MonthlyPoint } from "@shared/analysis/zip-market-stats";
import { linearScale } from "@/lib/chart-scale";

interface MiniTrendProps {
  points: MonthlyPoint[];
  className?: string;
}

const W = 120;
const H = 34;

export function MiniTrend({ points, className = "text-brand" }: MiniTrendProps) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.value);
  const y = linearScale([Math.min(...values), Math.max(...values)], [H - 4, 4]);
  const x = linearScale([0, points.length - 1], [2, W - 4]);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const last = points[points.length - 1]!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`block h-8 w-full ${className}`} aria-hidden="true" preserveAspectRatio="none">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(points.length - 1)} cy={y(last.value)} r={2.5} fill="currentColor" />
    </svg>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  unit: string;
  /** Change against the same month a year earlier, already formatted. */
  change: string;
  changeCaption: string;
  /** Where the latest month sits in the history, e.g. "Higher than 94% of months". */
  standing: string;
  range: string;
  trend: MonthlyPoint[];
  trendLabel: string;
}

export function KpiCard({ label, value, unit, change, changeCaption, standing, range, trend, trendLabel }: KpiCardProps) {
  return (
    <article className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-border bg-surface p-4 shadow-card">
      <h3 className="text-[12px] font-semibold leading-tight text-ink-soft">{label}</h3>
      <p className="text-2xl font-semibold tracking-tight text-ink tabular-nums">
        {value} <span className="text-[12px] font-normal text-ink-faint">{unit}</span>
      </p>
      <p className="text-[12px] tabular-nums text-ink-soft">
        <span className="font-semibold text-ink">{change}</span> {changeCaption}
      </p>
      <div title={trendLabel}>
        <MiniTrend points={trend} />
      </div>
      <p className="text-[11px] leading-snug text-ink-faint">{standing}</p>
      <p className="text-[11px] leading-snug text-ink-faint">{range}</p>
    </article>
  );
}

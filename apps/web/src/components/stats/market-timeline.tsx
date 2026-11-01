import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { MonthlyPoint } from "@shared/analysis/zip-market-stats";
import { linearScale, nearestIndex, niceTicks } from "@/lib/chart-scale";
import { useElementWidth } from "@/hooks/use-element-width";

export interface TimelineLine {
  id: string;
  label: string;
  points: MonthlyPoint[];
  /** Tailwind text colour class; the stroke follows currentColor. */
  className: string;
  dashed?: boolean;
}

export interface TimelinePanel {
  id: string;
  title: string;
  unit: string;
  lines: TimelineLine[];
  format: (value: number) => string;
}

export interface TimelinePhaseBand {
  id: string;
  number: number;
  from: string;
  to: string;
  title: string;
}

interface MarketTimelineProps {
  panels: TimelinePanel[];
  /** Every month on the shared axis, sorted ascending. */
  months: string[];
  phases: TimelinePhaseBand[];
  formatMonth: (month: string) => string;
  ariaLabel: string;
  keyboardHint: string;
  phasesLabel: string;
}

const LEFT = 54;
const RIGHT = 12;
const PANEL_HEIGHT = 128;
const PAD_Y = 10;
const STRIP_HEIGHT = 24;
const AXIS_HEIGHT = 22;

export function MarketTimeline({ panels, months, phases, formatMonth, ariaLabel, keyboardHint, phasesLabel }: MarketTimelineProps) {
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const width = Math.max(280, measured);
  const plotRight = width - RIGHT;
  const count = months.length;
  const [hover, setHover] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const active = hover ?? count - 1;
  const x = useMemo(() => linearScale([0, count - 1], [LEFT, plotRight]), [count, plotRight]);
  const step = (plotRight - LEFT) / Math.max(1, count - 1);
  const indexOfMonth = useMemo(() => new Map(months.map((month, i) => [month, i])), [months]);

  const yearStride = width < 520 ? 4 : 2;
  const yearTicks = useMemo(
    () => months.flatMap((month, i) => (month.endsWith("-01") && Number(month.slice(0, 4)) % yearStride === 1 ? [{ i, label: month.slice(0, 4) }] : [])),
    [months, yearStride],
  );

  const bands = phases.map((phase) => {
    const from = indexOfMonth.get(phase.from) ?? 0;
    const to = indexOfMonth.get(phase.to) ?? count - 1;
    const start = Math.max(LEFT, x(from) - step / 2);
    const end = Math.min(plotRight, x(to) + step / 2);
    return { ...phase, start, end };
  });

  function onPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setHover(nearestIndex(event.clientX - rect.left, LEFT, plotRight, count));
  }

  function summaryAt(index: number): string {
    const month = months[index]!;
    return `${formatMonth(month)}: ${panels
      .map((panel) => panel.lines.map((line) => `${line.label} ${valueAt(line.points, month, panel.format)}`).join(", "))
      .join("; ")}`;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const jump = event.shiftKey ? 12 : 1;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = Math.max(0, active - jump);
    else if (event.key === "ArrowRight") next = Math.min(count - 1, active + jump);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    else if (event.key === "Escape") {
      setHover(null);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    setHover(next);
    setAnnouncement(summaryAt(next));
  }

  const tracking = hover !== null;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerMove={onPointer}
      onPointerDown={onPointer}
      onPointerLeave={() => setHover(null)}
      onKeyDown={onKeyDown}
      onBlur={() => setHover(null)}
      style={{ touchAction: "pan-y" }}
      className="select-none rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
    >
      <p className="sr-only" aria-live="polite">{announcement}</p>

      <svg width={width} height={STRIP_HEIGHT} role="img" aria-label={phasesLabel} className="block">
        {bands.map((band) => (
          <g key={band.id}>
            <rect x={band.start} y={0} width={Math.max(0, band.end - band.start)} height={STRIP_HEIGHT} fill={band.number % 2 === 0 ? "var(--color-surface-alt)" : "transparent"} />
            <a href={`#phase-${band.id}`} aria-label={`${band.number}. ${band.title}`}>
              <title>{`${band.number}. ${band.title}`}</title>
              <text x={(band.start + band.end) / 2} y={16} textAnchor="middle" className="fill-current text-ink-soft" fontSize={11} fontWeight={600}>
                {band.number}
              </text>
            </a>
          </g>
        ))}
      </svg>

      {panels.map((panel, panelIndex) => {
        const values = panel.lines.flatMap((line) => line.points.map((point) => point.value));
        const lo = Math.min(...values);
        const hi = Math.max(...values);
        const padding = (hi - lo) * 0.06 || 1;
        const ticks = niceTicks(lo - padding, hi + padding, 3);
        const domain: [number, number] = [ticks[0] ?? lo, ticks[ticks.length - 1] ?? hi];
        const y = linearScale(domain, [PANEL_HEIGHT - PAD_Y, PAD_Y]);
        const isLast = panelIndex === panels.length - 1;
        const height = PANEL_HEIGHT + (isLast ? AXIS_HEIGHT : 0);
        const activeMonth = months[active]!;

        return (
          <div key={panel.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-1 pt-3">
              <h3 className="text-[13px] font-semibold text-ink">
                {panel.title} <span className="font-normal text-ink-faint">{panel.unit}</span>
              </h3>
              <p className={`flex flex-wrap gap-x-3 text-[12px] tabular-nums ${tracking ? "text-ink" : "text-ink-soft"}`}>
                {panel.lines.map((line) => (
                  <span key={line.id} className="inline-flex items-center gap-1.5">
                    <svg width="14" height="6" aria-hidden="true" className={line.className}>
                      <line x1="0" y1="3" x2="14" y2="3" stroke="currentColor" strokeWidth="2" strokeDasharray={line.dashed ? "3 2" : undefined} />
                    </svg>
                    {panel.lines.length > 1 && <span className="text-ink-faint">{line.label}</span>}
                    <span className="font-semibold">{valueAt(line.points, activeMonth, panel.format)}</span>
                  </span>
                ))}
                <span className="text-ink-faint">{formatMonth(activeMonth)}</span>
              </p>
            </div>
            <svg width={width} height={height} aria-hidden="true" className="block">
              {bands.map((band) => (
                <rect key={band.id} x={band.start} y={0} width={Math.max(0, band.end - band.start)} height={PANEL_HEIGHT} fill={band.number % 2 === 0 ? "var(--color-surface-alt)" : "transparent"} />
              ))}
              {ticks.map((tick) => (
                <g key={tick}>
                  <line x1={LEFT} x2={plotRight} y1={y(tick)} y2={y(tick)} stroke="var(--color-border)" strokeWidth={1} />
                  <text x={LEFT - 8} y={y(tick) + 3.5} textAnchor="end" fontSize={10} className="fill-current text-ink-faint">
                    {panel.format(tick)}
                  </text>
                </g>
              ))}
              {yearTicks.map((tick) => (
                <line key={tick.label} x1={x(tick.i)} x2={x(tick.i)} y1={PANEL_HEIGHT - PAD_Y} y2={PANEL_HEIGHT - PAD_Y + 4} stroke="var(--color-border-strong)" strokeWidth={1} />
              ))}
              {panel.lines.map((line) => (
                <path
                  key={line.id}
                  d={line.points.map((point, i) => `${i === 0 ? "M" : "L"}${x(indexOfMonth.get(point.month)!).toFixed(1)},${y(point.value).toFixed(1)}`).join("")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinejoin="round"
                  strokeDasharray={line.dashed ? "4 3" : undefined}
                  className={line.className}
                />
              ))}
              <line x1={x(active)} x2={x(active)} y1={0} y2={PANEL_HEIGHT} stroke="var(--color-text-secondary)" strokeWidth={1} opacity={tracking ? 0.7 : 0.3} />
              {panel.lines.map((line) => {
                const value = line.points.find((point) => point.month === activeMonth)?.value;
                return value === undefined ? null : <circle key={line.id} cx={x(active)} cy={y(value)} r={3.5} fill="var(--color-surface)" stroke="currentColor" strokeWidth={2} className={line.className} />;
              })}
              {isLast &&
                yearTicks.map((tick) => (
                  <text key={tick.label} x={x(tick.i)} y={PANEL_HEIGHT + 14} textAnchor="middle" fontSize={10} className="fill-current text-ink-faint">
                    {tick.label}
                  </text>
                ))}
            </svg>
          </div>
        );
      })}
      <p className="mt-2 px-1 text-[11px] text-ink-faint">{keyboardHint}</p>
    </div>
  );
}

function valueAt(points: MonthlyPoint[], month: string, format: (value: number) => string): string {
  const value = points.find((point) => point.month === month)?.value;
  return value === undefined ? "-" : format(value);
}

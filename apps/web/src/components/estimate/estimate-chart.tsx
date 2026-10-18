import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { SparHistoryPoint } from "@shared/types/spar";
import { formatDkk } from "@shared/utils/price";
import { useI18n } from "@/i18n/i18n";
import { formatMillions, formatPeriod } from "@/lib/smart-estimate";

interface EstimateChartProps {
  history: SparHistoryPoint[];
  askingPrice: number | null;
  height?: number;
}

const MARGIN = { top: 14, right: 14, bottom: 14, left: 58 };
/** Horizontal room per month. The ruler ticks sit this far apart. */
const PX_PER_MONTH = 7;
const RULER_HEIGHT = 56;
const SETTLE_DELAY_MS = 140;
const DRAG_THRESHOLD_PX = 4;

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

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Fair-price level over time with its 80 % band, read like a dial: a fixed cursor sits in the middle
 * and the month under it drives the readout. Scroll, drag or use the arrows to go back in time. The
 * line is today's valuation re-priced with each month's market level, so it shows market movement,
 * not this home's own history. Months that are still being revised are dashed.
 */
export function EstimateChart({ history, askingPrice, height = 260 }: EstimateChartProps) {
  const { language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const [wrapper, width] = useElementWidth();
  const scroller = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(history.length - 1);
  const [hintDismissed, setHintDismissed] = useState(false);
  const lastIndex = history.length - 1;

  // Half a viewport of padding on each side lets the first and last month reach the cursor.
  const viewportW = Math.max(width - MARGIN.left, 0);
  const pad = viewportW / 2;
  const plotW = viewportW + lastIndex * PX_PER_MONTH;

  const geometry = useMemo(() => {
    if (history.length < 2 || width < 120) return null;
    const lows = history.map(p => p.lo80), highs = history.map(p => p.hi80);
    let min = Math.min(...lows), max = Math.max(...highs);
    if (askingPrice !== null) { min = Math.min(min, askingPrice); max = Math.max(max, askingPrice); }
    const margin = (max - min) * 0.06;
    min -= margin; max += margin;
    const ticks = niceTicks(min, max);
    const innerH = height - MARGIN.top - MARGIN.bottom;
    const x = (i: number) => pad + i * PX_PER_MONTH;
    const y = (v: number) => MARGIN.top + (1 - (v - min) / (max - min)) * innerH;
    const firstPreliminary = history.findIndex(p => p.preliminary);
    const solidEnd = firstPreliminary === -1 ? history.length - 1 : Math.max(firstPreliminary - 1, 0);
    const path = (from: number, to: number) => history.slice(from, to + 1).map((p, k) => `${k === 0 ? "M" : "L"}${x(from + k).toFixed(1)},${y(p.estimate).toFixed(1)}`).join(" ");
    const band = `${history.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.hi80).toFixed(1)}`).join(" ")} ${history.map((_, i) => { const j = history.length - 1 - i; return `L${x(j).toFixed(1)},${y(history[j]!.lo80).toFixed(1)}`; }).join(" ")} Z`;
    return { ticks, x, y, band, solid: path(0, solidEnd), tail: solidEnd < history.length - 1 ? path(solidEnd, history.length - 1) : null };
  }, [history, askingPrice, width, pad, height]);

  const moveTo = useCallback((index: number, behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth") => {
    scroller.current?.scrollTo({ left: Math.min(lastIndex, Math.max(0, index)) * PX_PER_MONTH, behavior });
  }, [lastIndex]);

  const ready = geometry !== null;

  // Open on the most recent month: that is what the reader came for, older years sit one swipe away.
  const positioned = useRef(false);
  useLayoutEffect(() => {
    if (!ready || positioned.current) return;
    positioned.current = true;
    moveTo(lastIndex, "instant");
  }, [ready, lastIndex, moveTo]);

  // The scroller position is the single source of truth; everything else follows it.
  useEffect(() => {
    const element = scroller.current, ticks = ruler.current;
    if (!element || !ticks || !ready) return;
    let frame: number | undefined, settleTimer: number | undefined;
    let touching = false, pointerId: number | null = null, moved = false, startX = 0, startLeft = 0;

    const report = () => {
      frame = undefined;
      const exact = Math.min(lastIndex, Math.max(0, element.scrollLeft / PX_PER_MONTH));
      ticks.style.setProperty("--cursor", String(exact));
      setActive(Math.round(exact));
    };
    const settle = () => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        if (touching || pointerId !== null) return;
        const target = Math.round(element.scrollLeft / PX_PER_MONTH) * PX_PER_MONTH;
        if (Math.abs(element.scrollLeft - target) > 0.5) element.scrollTo({ left: target, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      }, SETTLE_DELAY_MS);
    };
    const onScroll = () => {
      if (frame === undefined) frame = requestAnimationFrame(report);
      settle();
    };
    const onTouchStart = () => { touching = true; };
    const onTouchEnd = () => { touching = false; settle(); };
    // Touch pans natively. A mouse needs an explicit drag, with the same grab feel as the family tree.
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      pointerId = event.pointerId; moved = false; startX = event.clientX; startLeft = element.scrollLeft;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const delta = event.clientX - startX;
      if (!moved && Math.abs(delta) < DRAG_THRESHOLD_PX) return;
      if (!moved) { moved = true; element.classList.add("cursor-grabbing", "select-none"); element.setPointerCapture(event.pointerId); }
      element.scrollLeft = startLeft - delta;
    };
    const endDrag = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      element.classList.remove("cursor-grabbing", "select-none");
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      settle();
    };
    // A vertical wheel over the ruler scrubs through time instead of scrolling the page.
    const onRulerWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      element.scrollLeft += event.deltaY;
    };

    report();
    element.addEventListener("scroll", onScroll, { passive: true });
    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchend", onTouchEnd, { passive: true });
    element.addEventListener("touchcancel", onTouchEnd, { passive: true });
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", endDrag);
    element.addEventListener("pointercancel", endDrag);
    ticks.addEventListener("wheel", onRulerWheel, { passive: false });
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      element.removeEventListener("scroll", onScroll);
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", onTouchEnd);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", endDrag);
      element.removeEventListener("pointercancel", endDrag);
      ticks.removeEventListener("wheel", onRulerWheel);
    };
  }, [ready, lastIndex]);

  function onRulerKeyDown(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, PageUp: -12, PageDown: 12 };
    if (event.key in steps) moveTo(active + steps[event.key]!);
    else if (event.key === "Home") moveTo(0);
    else if (event.key === "End") moveTo(lastIndex);
    else return;
    event.preventDefault();
  }

  const shown = history[Math.min(active, lastIndex)]!;
  const last = history[lastIndex];
  const summary = last ? tx(
    `Fair pris over tid: ${formatDkk(Math.round(history[0]!.estimate))} i ${formatPeriod(history[0]!.period, language)} til ${formatDkk(Math.round(last.estimate))} i ${formatPeriod(last.period, language)}.`,
    `Fair price over time: ${formatDkk(Math.round(history[0]!.estimate))} in ${formatPeriod(history[0]!.period, language)} to ${formatDkk(Math.round(last.estimate))} in ${formatPeriod(last.period, language)}.`) : "";
  const valueText = `${formatPeriod(shown.period, language)}: ${formatDkk(Math.round(shown.estimate))}`;

  return <div className="w-full min-w-0 max-w-full [contain:inline-size]">
    <div className="overflow-hidden rounded-2xl border border-[var(--color-footer-border)] bg-[var(--color-footer-bg)] shadow-card">
      <div className="flex flex-col-reverse gap-3 px-4 pb-2 pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 sm:block">
          <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-footer-muted)]">{formatPeriod(shown.period, language)}{shown.preliminary ? ` · ${tx("foreløbig", "preliminary")}` : ""}</p>
          <p className="w-fit whitespace-nowrap rounded-full sm:mt-1.5 bg-white/10 px-3 py-1 text-xs font-semibold tabular-nums text-accent">
            {tx("80 % interval", "80% interval")} {formatMillions(shown.lo80, language)} – {formatMillions(shown.hi80, language)}
          </p>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-1.5 sm:justify-start">
          <button type="button" disabled={active <= 0} onClick={() => moveTo(active - 1)} aria-label={tx("Forrige måned", "Previous month")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-accent transition hover:bg-white/20 disabled:cursor-default disabled:opacity-30">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
          </button>
          <output aria-live="polite" aria-label={tx("Valgt fair pris", "Selected fair price")} className="min-w-[8.5ch] text-center text-2xl font-light leading-none tracking-tight tabular-nums text-accent sm:text-[34px]">
            {formatDkk(Math.round(shown.estimate))}
          </output>
          <button type="button" disabled={active >= lastIndex} onClick={() => moveTo(active + 1)} aria-label={tx("Næste måned", "Next month")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-accent transition hover:bg-white/20 disabled:cursor-default disabled:opacity-30">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </div>
      </div>

      <div ref={wrapper} className="relative flex w-full bg-surface" style={{ height: height + RULER_HEIGHT }}>
        {geometry && <>
          <div className="shrink-0 bg-[var(--color-footer-bg)]" style={{ width: MARGIN.left }}>
            <svg width={MARGIN.left} height={height + RULER_HEIGHT} aria-hidden="true" className="block" style={{ background: `linear-gradient(var(--color-footer-bg) ${RULER_HEIGHT}px, var(--color-surface) ${RULER_HEIGHT}px)` }}>
              {geometry.ticks.map(tick => <text key={tick} x={MARGIN.left - 8} y={RULER_HEIGHT + geometry.y(tick)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="var(--color-text-secondary)">{formatMillions(tick, language)}</text>)}
            </svg>
          </div>
          <div ref={scroller} onPointerDown={() => setHintDismissed(true)} onWheel={() => setHintDismissed(true)}
            className="relative min-w-0 flex-1 cursor-grab overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="relative" style={{ width: plotW, height: height + RULER_HEIGHT }}>
              <div ref={ruler} role="slider" tabIndex={0} aria-label={tx("Måned på kurven", "Month on the curve")} aria-valuemin={0} aria-valuemax={lastIndex} aria-valuenow={active} aria-valuetext={valueText}
                aria-keyshortcuts="ArrowLeft ArrowRight PageUp PageDown Home End" onKeyDown={onRulerKeyDown}
                className="sticky top-0 z-[1] bg-[var(--color-footer-bg)] [--cursor:0] focus-visible:outline focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-accent"
                style={{ height: RULER_HEIGHT, width: plotW, touchAction: "pan-x pan-y" }}>
                {history.map((p, i) => {
                  const month = p.period.slice(5, 7);
                  const January = month === "01";
                  return <span key={p.period} aria-hidden="true" className="absolute -ml-px w-0.5 rounded-sm bg-accent"
                    style={{ left: geometry.x(i), bottom: 10, height: January ? 22 : month === "07" ? 18 : 12, opacity: "clamp(0.26, calc(1 + (var(--cursor) - var(--y)) * 0.12), 1)", "--y": i } as CSSProperties}>
                    {January && <span className="absolute bottom-[27px] left-1/2 -translate-x-1/2 text-[11px] font-semibold tabular-nums text-accent">{p.period.slice(0, 4)}</span>}
                  </span>;
                })}
              </div>
              <svg width={plotW} height={height} role="img" aria-label={summary} className="absolute left-0" style={{ top: RULER_HEIGHT }}>
                {geometry.ticks.map(tick => <line key={tick} x1={0} x2={plotW} y1={geometry.y(tick)} y2={geometry.y(tick)} stroke="var(--color-border)" strokeDasharray="3 4" />)}
                <path d={geometry.band} fill="var(--color-brand)" opacity="0.14" />
                {askingPrice !== null && <g>
                  <line x1={0} x2={plotW} y1={geometry.y(askingPrice)} y2={geometry.y(askingPrice)} stroke="var(--color-brand)" strokeWidth="1.5" strokeDasharray="6 4" />
                  <text x={pad + 6} y={geometry.y(askingPrice) - 6} textAnchor="start" fontSize="11" fontWeight="600" fill="var(--color-brand-text)" stroke="var(--color-surface)" strokeWidth="3" paintOrder="stroke">{tx("Udbudspris", "Asking price")}</text>
                </g>}
                <path d={geometry.solid} fill="none" stroke="var(--color-text-primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {geometry.tail && <path d={geometry.tail} fill="none" stroke="var(--color-text-primary)" strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" />}
                <circle cx={geometry.x(Math.min(active, lastIndex))} cy={geometry.y(shown.estimate)} r="5" fill="var(--color-surface)" stroke="var(--color-text-primary)" strokeWidth="2" />
              </svg>
            </div>
          </div>
          {/* The cursor stays put; the data moves under it. */}
          <div aria-hidden="true" className="pointer-events-none absolute z-[2] w-0.5 -translate-x-1/2"
            style={{ left: MARGIN.left + pad, top: 18, bottom: 0, background: `linear-gradient(var(--color-accent) ${RULER_HEIGHT - 18}px, var(--color-border-strong) ${RULER_HEIGHT - 18}px)` }}>
            <span className="absolute left-1/2 -translate-x-1/2 border-x-[6px] border-b-8 border-x-transparent border-b-accent" style={{ top: RULER_HEIGHT - 26 }} />
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute top-0 z-[2] h-14 w-[72px] bg-gradient-to-r from-[var(--color-footer-bg)] to-transparent" style={{ left: MARGIN.left }} />
          <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 z-[2] h-14 w-[72px] bg-gradient-to-l from-[var(--color-footer-bg)] to-transparent" />
        </>}
      </div>
    </div>
    {!hintDismissed && geometry && <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-ink-soft">
      <span aria-hidden="true">←</span>{tx("Træk i linealen for at gå tilbage i tiden", "Drag the ruler to go back in time")}
    </p>}
  </div>;
}

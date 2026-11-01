export interface DivergingBar {
  label: string;
  value: number | null;
  emphasize?: boolean;
}

interface DivergingBarsProps {
  bars: DivergingBar[];
  /** Symmetric value range shown above and below the zero line. */
  maxAbs: number;
  format: (value: number) => string;
  ariaLabel: string;
  /** Show every n-th x label to keep a long axis readable. */
  labelEvery?: number;
}

const WIDTH = 420;
const HEIGHT = 150;
const TOP = 16;
const BOTTOM = 126;
const ZERO = (TOP + BOTTOM) / 2;

/** Bars above and below a zero line; used for lag profiles and seasonal patterns. */
export function DivergingBars({ bars, maxAbs, format, ariaLabel, labelEvery = 1 }: DivergingBarsProps) {
  const slot = WIDTH / bars.length;
  const barWidth = Math.max(4, slot * 0.62);
  const scale = (BOTTOM - ZERO) / (maxAbs || 1);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={ariaLabel} className="block h-auto w-full">
      <line x1={0} x2={WIDTH} y1={ZERO} y2={ZERO} stroke="var(--color-border-strong)" strokeWidth={1} />
      {bars.map((bar, i) => {
        const cx = slot * i + slot / 2;
        const value = bar.value ?? 0;
        const h = Math.min(BOTTOM - ZERO, Math.abs(value) * scale);
        const y = value >= 0 ? ZERO - h : ZERO;
        const tone = bar.emphasize ? "text-brand" : "text-ink-faint";
        return (
          <g key={`${bar.label}-${i}`}>
            <title>{`${bar.label}: ${bar.value === null ? "-" : format(bar.value)}`}</title>
            {bar.value !== null && <rect x={cx - barWidth / 2} y={y} width={barWidth} height={Math.max(1, h)} rx={1.5} fill="currentColor" className={tone} opacity={bar.emphasize ? 1 : 0.55} />}
            {bar.emphasize && bar.value !== null && (
              <text x={cx} y={value >= 0 ? y - 4 : y + h + 11} textAnchor="middle" fontSize={11} fontWeight={700} className="fill-current text-ink">
                {format(bar.value)}
              </text>
            )}
            {i % labelEvery === 0 && (
              <text x={cx} y={HEIGHT - 10} textAnchor="middle" fontSize={10} className={`fill-current ${bar.emphasize ? "font-semibold text-ink" : "text-ink-faint"}`}>
                {bar.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

import { linearScale } from "@/lib/chart-scale";

interface ScatterChartProps {
  /** [faktisk pris, estimeret pris] i DKK. */
  points: [number, number][];
  ariaLabel: string;
  xLabel: string;
  yLabel: string;
}

const W = 420;
const H = 320;
const PAD = { l: 52, r: 12, t: 12, b: 40 };

/** Estimeret mod faktisk pris på logaritmisk skala. Punkter på diagonalen er ramt. Intet her er et træningsfit. */
export function ScatterChart({ points, ariaLabel, xLabel, yLabel }: ScatterChartProps) {
  const valid = points.filter(([a, b]) => a > 0 && b > 0);
  if (valid.length === 0) return null;
  const logs = valid.flatMap(([a, b]) => [Math.log10(a), Math.log10(b)]);
  const lo = Math.floor(Math.min(...logs) * 4) / 4;
  const hi = Math.ceil(Math.max(...logs) * 4) / 4;
  const x = linearScale([lo, hi], [PAD.l, W - PAD.r]);
  const y = linearScale([lo, hi], [H - PAD.b, PAD.t]);
  const ticks: number[] = [];
  for (let t = Math.ceil(lo * 2) / 2; t <= hi + 1e-9; t += 0.5) ticks.push(t);
  const label = (t: number) => `${(10 ** t / 1e6).toLocaleString("da-DK", { maximumFractionDigits: 1 })} mio.`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="block h-auto w-full max-w-[460px] text-ink-soft">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={0.15} />
          <line x1={x(t)} x2={x(t)} y1={PAD.t} y2={H - PAD.b} stroke="currentColor" strokeOpacity={0.15} />
          <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="currentColor">{label(t)}</text>
          <text x={x(t)} y={H - PAD.b + 14} textAnchor="middle" fontSize={10} fill="currentColor">{label(t)}</text>
        </g>
      ))}
      <line x1={x(lo)} y1={y(lo)} x2={x(hi)} y2={y(hi)} stroke="currentColor" strokeDasharray="4 3" strokeOpacity={0.6} />
      {valid.map(([a, b], i) => (
        <circle key={i} cx={x(Math.log10(a))} cy={y(Math.log10(b))} r={3} className="fill-brand" fillOpacity={0.55} />
      ))}
      <text x={(PAD.l + W - PAD.r) / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="currentColor">{xLabel}</text>
      <text transform={`translate(12 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill="currentColor">{yLabel}</text>
    </svg>
  );
}

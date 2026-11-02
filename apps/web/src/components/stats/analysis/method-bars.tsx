import { fmt } from "@/lib/hedonic-view";

export interface MethodBar {
  id: string;
  label: string;
  value: number | null;
  n: number;
  highlight?: boolean;
}

/** Vandrette søjler af MdAPE. Tallet og n står altid ved siden af søjlen. */
export function MethodBars({ bars, ariaLabel }: { bars: MethodBar[]; ariaLabel: string }) {
  const max = Math.max(0.05, ...bars.map((b) => b.value ?? 0));
  return (
    <ul aria-label={ariaLabel} className="grid gap-2">
      {bars.map((b) => (
        <li key={b.id} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-[12.5px]">
          <span className={`truncate ${b.highlight ? "font-semibold text-ink" : "text-ink-soft"}`}>{b.label}</span>
          <span className="h-3.5 rounded bg-surface-alt" aria-hidden="true">
            <span
              className={`block h-full rounded ${b.highlight ? "bg-brand" : "bg-ink-faint"}`}
              style={{ width: b.value === null ? 0 : `${Math.max(2, (b.value / max) * 100)}%` }}
            />
          </span>
          <span className="tabular-nums text-ink">
            {fmt.pct(b.value)} <span className="text-ink-faint">n={b.n}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

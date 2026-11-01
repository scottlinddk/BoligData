import type { PairCorrelation, StatSeriesKey } from "@shared/analysis/zip-market-relationships";

interface CorrelationMatrixProps {
  keys: StatSeriesKey[];
  pairs: PairCorrelation[];
  labels: Record<StatSeriesKey, string>;
  format: (r: number | null) => string;
  caption: string;
}

function cellStyle(r: number | null) {
  if (r === null) return undefined;
  const strength = Math.round(Math.min(1, Math.abs(r)) * 70);
  const tone = r >= 0 ? "var(--color-brand)" : "var(--color-text-secondary)";
  return { backgroundColor: `color-mix(in srgb, ${tone} ${strength}%, transparent)` };
}

/** Symmetric correlation table. The number is always printed, colour only reinforces it. */
export function CorrelationMatrix({ keys, pairs, labels, format, caption }: CorrelationMatrixProps) {
  const find = (a: StatSeriesKey, b: StatSeriesKey) => pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] border-separate border-spacing-1 text-center text-[12px] tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <td />
            {keys.map((key) => (
              <th key={key} scope="col" className="px-1 pb-1 align-bottom text-[11px] font-semibold leading-tight text-ink-soft">
                {labels[key]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map((row) => (
            <tr key={row}>
              <th scope="row" className="pr-2 text-right text-[11px] font-semibold leading-tight text-ink-soft">
                {labels[row]}
              </th>
              {keys.map((col) => {
                if (row === col) return <td key={col} className="rounded-md bg-surface-alt py-2.5 text-ink-faint">1</td>;
                const r = find(row, col)?.r ?? null;
                return (
                  <td key={col} style={cellStyle(r)} className="rounded-md py-2.5 font-semibold text-ink">
                    {format(r)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

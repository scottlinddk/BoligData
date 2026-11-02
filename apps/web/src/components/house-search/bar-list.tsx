export interface BarItem {
  key: string;
  label: string;
  value: number;
  /** Shown after the bar. Defaults to the plain value. */
  valueLabel?: string;
}

/**
 * Horizontal bars as a list. Bar length is relative to the largest value, never to a
 * made-up axis, and every value is also printed, so nothing is conveyed by length alone.
 */
export function BarList({ title, items, emptyLabel }: { title: string; items: BarItem[]; emptyLabel: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <section aria-label={title}>
      <h4 className="mb-2 text-sm font-bold text-ink">{title}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-ink-soft">{emptyLabel}</p>
      ) : (
        <ul className="grid gap-1.5">
          {items.map((item) => (
            <li key={item.key} className="grid grid-cols-[minmax(5.5rem,34%)_1fr_auto] items-center gap-2 text-xs">
              <span className="truncate text-ink-soft" title={item.label}>{item.label}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-surface-alt" aria-hidden="true">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }} />
              </span>
              <span className="min-w-6 text-right font-semibold tabular-nums text-ink">{item.valueLabel ?? item.value}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

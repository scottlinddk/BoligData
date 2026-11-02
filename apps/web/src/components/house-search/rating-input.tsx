import { useI18n } from "@/i18n/i18n";

const OPTIONS = [1, 2, 3, 4, 5] as const;
const base = "min-w-9 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors";
const on = "border-cta bg-cta text-cta-text";
const off = "border-border-strong bg-surface text-ink hover:bg-surface-hover";

/** 1 to 5, or none. A segmented button group, so it works with keyboard and screen readers without a custom widget. */
export function RatingInput({ value, onChange, label }: { value: number | null; onChange: (value: number | null) => void; label: string }) {
  const { t } = useI18n();
  return (
    <div role="group" aria-label={label} className="mt-1 flex flex-wrap gap-1.5">
      <button type="button" aria-pressed={value === null} className={`${base} ${value === null ? on : off}`} onClick={() => onChange(null)}>
        {t("hs.form.noRating")}
      </button>
      {OPTIONS.map((n) => (
        <button key={n} type="button" aria-pressed={value === n} className={`${base} ${value === n ? on : off}`} onClick={() => onChange(n)}>
          {n}
        </button>
      ))}
    </div>
  );
}

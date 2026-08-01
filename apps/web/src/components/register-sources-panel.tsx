import type { SourceSummaryEntry } from "@/lib/property-facts";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";

interface RegisterSourcesPanelProps {
  sources: SourceSummaryEntry[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

const MODE_CLASS: Record<SourceSummaryEntry["mode"], string> = {
  live: "bg-success-soft text-success",
  mock: "bg-warning-soft text-warning",
  unavailable: "bg-surface-alt text-ink-faint",
};

/**
 * Per-register provenance for the facts shown above: which of DAR, BBR, VUR
 * and the noise map actually answered this request, and why any of them
 * didn't.
 *
 * This exists because the failure mode it replaces was invisible. The lookup
 * endpoint used to serve fabricated matrikelnumre and assessed values that
 * were indistinguishable from real ones on screen; a figure that is missing
 * for a nameable reason is more useful for due diligence than a plausible
 * number of unknown origin. The upstream error text is shown verbatim rather
 * than mapped to a friendly string — it is the thing an operator needs.
 */
export function RegisterSourcesPanel({ sources, isLoading, isError, onRetry }: RegisterSourcesPanelProps) {
  const { t } = useI18n();

  const title = <h3 className="text-[15px] font-extrabold text-ink">{t("register.title")}</h3>;

  if (isError) {
    return (
      <div className="rounded-[20px] border border-danger-soft bg-danger-soft p-4">
        {title}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-[12.5px] font-semibold text-danger">{t("register.error")}</p>
          <button onClick={onRetry} className="rounded-full bg-danger px-4 py-1.5 text-sm font-bold text-white">
            {t("common.retry")}
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || sources.length === 0) {
    return (
      <div className="rounded-[20px] border border-dashed border-border-strong p-4">
        {title}
        <p className="mt-2 text-[12.5px] text-ink-faint">{t("register.loading")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
      {title}
      <ul className="mt-3 flex flex-col gap-2">
        {sources.map((source) => (
          <li key={source.key} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-ink">
                {t(`register.source.${source.key}` as TranslationKey)}
              </span>
              <span className={`ds-mono rounded-[5px] px-1.5 py-0.5 text-[9px] ${MODE_CLASS[source.mode]}`}>
                {t(`register.mode.${source.mode}` as TranslationKey)}
              </span>
            </div>
            {source.error !== null && (
              <span className="ds-mono break-words text-[9.5px] text-ink-faint">{source.error}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

import type { DueDiligenceScoreBreakdown } from "@shared/utils/due-diligence-score";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";

const SCORE_STYLES = {
  good: "bg-success-soft text-success-text border-success-soft",
  warning: "bg-warning-soft text-warning-text border-warning-soft",
  bad: "bg-danger-soft text-danger border-danger-soft",
  unknown: "bg-unknown-soft text-unknown-text border-unknown-soft",
} as const;

function scoreTier(score: number): keyof typeof SCORE_STYLES {
  if (score >= 8) return "good";
  if (score >= 5) return "warning";
  return "bad";
}

export function DueDiligenceScoreBadge({ breakdown }: { breakdown: DueDiligenceScoreBreakdown }) {
  const { t } = useI18n();
  const { score, deductions } = breakdown;
  const tier = score === null ? "unknown" : scoreTier(score);

  return (
    <div className={`rounded-2xl border p-4 ${SCORE_STYLES[tier]}`}>
      <div className="font-mono text-[10.5px] uppercase tracking-widest opacity-80">
        {t("dueDiligenceScore.title")}
      </div>
      <div className="mt-1 font-serif text-3xl">
        {score === null ? t("dueDiligenceScore.unknown") : t("dueDiligenceScore.outOf", { score: String(score) })}
      </div>
      {score !== null && (
        <ul className="mt-2 flex flex-col gap-0.5 text-xs font-medium opacity-90">
          {deductions.length === 0 && <li>{t("dueDiligenceScore.noIssues")}</li>}
          {deductions.map((d) => (
            <li key={d.label}>
              {t(`dueDiligenceScore.deduction.${d.label}` as TranslationKey)} (−{d.points})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

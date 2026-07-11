import type { RiskFlags } from "@shared/types/index";
import { useI18n, type TranslateFn } from "@/i18n/i18n";

interface ChecklistItem {
  label: string;
  status: "ok" | "warning" | "unknown";
  detail: string;
}

function buildChecklist(riskFlags: RiskFlags | null, t: TranslateFn): ChecklistItem[] {
  if (!riskFlags) {
    return (
      ["noise", "encumbrance", "sewer", "oilTank", "soil"] as const
    ).map((key) => ({
      label: t(`dueDiligence.${key}.label`),
      status: "unknown" as const,
      detail: t("dueDiligence.noData"),
    }));
  }

  return [
    {
      label: t("dueDiligence.noise.label"),
      status: riskFlags.noiseExposureLden !== null && riskFlags.noiseExposureLden > 58 ? "warning" : "ok",
      detail:
        riskFlags.noiseExposureLden !== null
          ? t("dueDiligence.noise.value", { value: riskFlags.noiseExposureLden })
          : t("dueDiligence.noise.none"),
    },
    {
      label: t("dueDiligence.encumbrance.label"),
      status: riskFlags.encumbranceCheckRequired ? "warning" : "ok",
      detail: riskFlags.encumbranceCheckRequired
        ? t("dueDiligence.encumbrance.warning")
        : t("dueDiligence.encumbrance.ok"),
    },
    {
      label: t("dueDiligence.sewer.label"),
      status: riskFlags.sewerSeparationRequired ? "warning" : "ok",
      detail: riskFlags.sewerSeparationRequired
        ? t("dueDiligence.sewer.warning")
        : t("dueDiligence.sewer.ok"),
    },
    {
      label: t("dueDiligence.oilTank.label"),
      status: riskFlags.oilTankRisk ? "warning" : "ok",
      detail: riskFlags.oilTankRisk ? t("dueDiligence.oilTank.warning") : t("dueDiligence.oilTank.ok"),
    },
    {
      label: t("dueDiligence.soil.label"),
      status: riskFlags.soilContaminationRisk ? "warning" : "ok",
      detail: riskFlags.soilContaminationRisk ? t("dueDiligence.soil.warning") : t("dueDiligence.soil.ok"),
    },
  ];
}

const STATUS_STYLES: Record<ChecklistItem["status"], string> = {
  ok: "bg-success-soft text-success-text border-success-soft",
  warning: "bg-warning-soft text-warning-text border-warning-soft",
  unknown: "bg-unknown-soft text-unknown-text border-unknown-soft",
};

export function DueDiligenceChecklist({ riskFlags }: { riskFlags: RiskFlags | null }) {
  const { t } = useI18n();
  const items = buildChecklist(riskFlags, t);

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <h3 className="mb-3 text-[15px] font-extrabold text-ink">{t("dueDiligence.title")}</h3>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.label} className={`rounded-lg border px-3 py-2 text-sm ${STATUS_STYLES[item.status]}`}>
            <div className="font-bold">{item.label}</div>
            <div className="mt-0.5 text-xs opacity-85">{item.detail}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  warning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  unknown: "bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

export function DueDiligenceChecklist({ riskFlags }: { riskFlags: RiskFlags | null }) {
  const { t } = useI18n();
  const items = buildChecklist(riskFlags, t);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-3 font-semibold text-slate-900 dark:text-slate-100">{t("dueDiligence.title")}</h3>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.label}
            className={`rounded-md border px-3 py-2 text-sm ${STATUS_STYLES[item.status]}`}
          >
            <div className="font-medium">{item.label}</div>
            <div className="text-xs opacity-80">{item.detail}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

import type { RiskFlags } from "@shared/types/index";
import { useI18n, type TranslateFn } from "@/i18n/i18n";

interface ChecklistItem {
  label: string;
  status: "ok" | "warning" | "unknown";
  detail: string;
  /** When set, `detail` is rendered as a link (e.g. the tinglysning.dk deep-link for the encumbrance item). */
  href?: string | null;
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

  const soil = riskFlags.soilContamination;
  const soilStatus: ChecklistItem["status"] =
    soil.classification === "v1" || soil.classification === "v2"
      ? "warning"
      : soil.classification === "unknown"
        ? "unknown"
        : "ok";
  const soilDetailKey =
    soil.classification === "v2"
      ? "dueDiligence.soil.v2"
      : soil.classification === "v1"
        ? "dueDiligence.soil.v1"
        : soil.classification === "unknown"
          ? "dueDiligence.soil.unknown"
          : "dueDiligence.soil.none";

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
      status: "warning",
      detail: riskFlags.encumbranceLookupUrl
        ? t("dueDiligence.encumbrance.linkLabel")
        : t("dueDiligence.encumbrance.warning"),
      href: riskFlags.encumbranceLookupUrl,
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
      status: soilStatus,
      detail: t(soilDetailKey),
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
            <div className="mt-0.5 text-xs opacity-85">
              {item.href ? (
                <a href={item.href} target="_blank" rel="noreferrer" className="underline">
                  {item.detail}
                </a>
              ) : (
                item.detail
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

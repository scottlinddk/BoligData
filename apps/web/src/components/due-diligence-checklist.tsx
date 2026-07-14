import type { RiskFlags } from "@shared/types/index";
import { useI18n, type TranslateFn } from "@/i18n/i18n";

const MILJOEGIS_NOISE_MAP_URL = "https://miljoegis.mim.dk/spatialmap?profile=stoej";
const MILJOEPORTAL_SOIL_MAP_URL = "https://arealinformation.miljoeportal.dk/";
const BBR_URL = "https://bbr.dk/";

interface ChecklistItem {
  label: string;
  status: "ok" | "warning" | "unknown";
  detail: string;
  /** When set, `detail` is rendered as a link (e.g. the tinglysning.dk deep-link for the encumbrance item). */
  href?: string | null;
  /** Where this flag's value comes from — shown under the status line, linked out when a public lookup exists. */
  source: string;
  sourceHref?: string | null;
}

function buildChecklist(riskFlags: RiskFlags | null, t: TranslateFn): ChecklistItem[] {
  if (!riskFlags) {
    return (
      ["noise", "encumbrance", "sewer", "oilTank", "soil"] as const
    ).map((key) => ({
      label: t(`dueDiligence.${key}.label`),
      status: "unknown" as const,
      detail: t("dueDiligence.noData"),
      source: t("dueDiligence.noData"),
    }));
  }

  // Older enrichment rows were written before soilContamination existed on
  // RiskFlags, so the stored JSON can still lack it — guard against that
  // instead of trusting the type to match what's actually in the DB.
  const soilClassification = riskFlags.soilContamination?.classification ?? "unknown";
  const soilStatus: ChecklistItem["status"] =
    soilClassification === "v1" || soilClassification === "v2"
      ? "warning"
      : soilClassification === "unknown"
        ? "unknown"
        : "ok";
  const soilDetailKey =
    soilClassification === "v2"
      ? "dueDiligence.soil.v2"
      : soilClassification === "v1"
        ? "dueDiligence.soil.v1"
        : soilClassification === "unknown"
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
      source: t("dueDiligence.noise.source"),
      sourceHref: MILJOEGIS_NOISE_MAP_URL,
    },
    {
      label: t("dueDiligence.encumbrance.label"),
      status: "warning",
      detail: riskFlags.encumbranceLookupUrl
        ? t("dueDiligence.encumbrance.linkLabel")
        : t("dueDiligence.encumbrance.warning"),
      href: riskFlags.encumbranceLookupUrl,
      source: t("dueDiligence.encumbrance.source"),
      sourceHref: riskFlags.encumbranceLookupUrl,
    },
    {
      label: t("dueDiligence.sewer.label"),
      status: "warning",
      detail: riskFlags.sewerSeparationLookupUrl
        ? t("dueDiligence.sewer.linkLabel")
        : t("dueDiligence.sewer.warning"),
      href: riskFlags.sewerSeparationLookupUrl,
      source: t("dueDiligence.sewer.source"),
      sourceHref: riskFlags.sewerSeparationLookupUrl,
    },
    {
      label: t("dueDiligence.oilTank.label"),
      status: riskFlags.oilTankRisk ? "warning" : "ok",
      detail: riskFlags.oilTankRisk ? t("dueDiligence.oilTank.warning") : t("dueDiligence.oilTank.ok"),
      source:
        riskFlags.oilTankRiskSource === "bbr"
          ? t("dueDiligence.oilTank.source.bbr")
          : t("dueDiligence.oilTank.source.heuristic"),
      sourceHref: riskFlags.oilTankRiskSource === "bbr" ? BBR_URL : null,
    },
    {
      label: t("dueDiligence.soil.label"),
      status: soilStatus,
      detail: t(soilDetailKey),
      source: t("dueDiligence.soil.source"),
      sourceHref: MILJOEPORTAL_SOIL_MAP_URL,
    },
  ];
}

const STATUS_PILL_STYLES: Record<ChecklistItem["status"], string> = {
  ok: "bg-success-soft text-success-text",
  warning: "bg-warning-soft text-warning-text",
  unknown: "bg-unknown-soft text-unknown-text",
};

const STATUS_PILL_KEY = {
  ok: "dueDiligence.status.ok",
  warning: "dueDiligence.status.flagged",
  unknown: "dueDiligence.status.unknown",
} as const;

export function DueDiligenceChecklist({ riskFlags }: { riskFlags: RiskFlags | null }) {
  const { t } = useI18n();
  const items = buildChecklist(riskFlags, t);

  return (
    <div className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
      <h3 className="mb-3 font-mono text-[10.5px] uppercase tracking-widest text-ink-faint">
        {t("dueDiligence.title")}
      </h3>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.label} className="rounded-2xl border border-border bg-surface-alt px-3.5 py-2.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-ink">{item.label}</span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-widest ${STATUS_PILL_STYLES[item.status]}`}
              >
                {t(STATUS_PILL_KEY[item.status])}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-ink-soft">
              {item.href ? (
                <a href={item.href} target="_blank" rel="noreferrer" className="underline">
                  {item.detail}
                </a>
              ) : (
                item.detail
              )}
            </div>
            <div className="mt-1 text-[11px] text-ink-faint">
              {item.sourceHref ? (
                <a href={item.sourceHref} target="_blank" rel="noreferrer" className="underline">
                  {t("dueDiligence.source", { source: item.source })}
                </a>
              ) : (
                t("dueDiligence.source", { source: item.source })
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

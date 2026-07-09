import type { RiskFlags } from "@shared/types/index";

interface ChecklistItem {
  label: string;
  status: "ok" | "warning" | "unknown";
  detail: string;
}

function buildChecklist(riskFlags: RiskFlags | null): ChecklistItem[] {
  if (!riskFlags) {
    return [
      { label: "Noise exposure", status: "unknown", detail: "No enrichment data yet." },
      { label: "Encumbrance check (tingbogsattest)", status: "unknown", detail: "No enrichment data yet." },
      { label: "Sewer separation", status: "unknown", detail: "No enrichment data yet." },
      { label: "Oil tank risk", status: "unknown", detail: "No enrichment data yet." },
      { label: "Soil contamination risk", status: "unknown", detail: "No enrichment data yet." },
    ];
  }

  return [
    {
      label: "Noise exposure",
      status: riskFlags.noiseExposureLden !== null && riskFlags.noiseExposureLden > 58 ? "warning" : "ok",
      detail:
        riskFlags.noiseExposureLden !== null
          ? `Lden ${riskFlags.noiseExposureLden} dB`
          : "No traffic noise data available.",
    },
    {
      label: "Encumbrance check (tingbogsattest)",
      status: riskFlags.encumbranceCheckRequired ? "warning" : "ok",
      detail: riskFlags.encumbranceCheckRequired
        ? "Order a tingbogsattest before making an offer."
        : "No outstanding encumbrance flags found.",
    },
    {
      label: "Sewer separation",
      status: riskFlags.sewerSeparationRequired ? "warning" : "ok",
      detail: riskFlags.sewerSeparationRequired
        ? "Property may require separation of rain/waste water."
        : "No separation requirement on record.",
    },
    {
      label: "Oil tank risk",
      status: riskFlags.oilTankRisk ? "warning" : "ok",
      detail: riskFlags.oilTankRisk
        ? "Building age suggests a possible legacy oil tank."
        : "No oil tank risk indicated.",
    },
    {
      label: "Soil contamination risk",
      status: riskFlags.soilContaminationRisk ? "warning" : "ok",
      detail: riskFlags.soilContaminationRisk
        ? "Area has a recorded soil contamination flag."
        : "No soil contamination flag on record.",
    },
  ];
}

const STATUS_STYLES: Record<ChecklistItem["status"], string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  unknown: "bg-slate-50 text-slate-500 border-slate-200",
};

export function DueDiligenceChecklist({ riskFlags }: { riskFlags: RiskFlags | null }) {
  const items = buildChecklist(riskFlags);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 font-semibold text-slate-900">Due diligence checklist</h3>
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

import type { BbrData } from "@shared/types/index";
import { useI18n } from "@/i18n/i18n";

interface BbrFactsPanelProps {
  bbrData: BbrData | null;
  /** Registered plot area from Matriklen — BBR keys plot size off the cadastre, so the panel shows it alongside the building facts. */
  plotSqm: number | null;
}

/** BBR building-facts panel: heating, materials, floors and areas, with a per-row "no data yet" fallback. */
export function BbrFactsPanel({ bbrData, plotSqm }: BbrFactsPanelProps) {
  const { t } = useI18n();

  const facts: Array<{ label: string; value: string | null }> = [
    { label: t("bbrFacts.heating"), value: bbrData?.heatingInstallation ?? null },
    { label: t("bbrFacts.wallMaterial"), value: bbrData?.wallMaterial ?? null },
    { label: t("bbrFacts.roofMaterial"), value: bbrData?.roofMaterial ?? null },
    { label: t("bbrFacts.floors"), value: bbrData?.floors != null ? String(bbrData.floors) : null },
    { label: t("bbrFacts.plotSqm"), value: plotSqm != null ? t("property.sqm", { sqm: plotSqm }) : null },
    {
      label: t("bbrFacts.basementSqm"),
      value: bbrData?.basementSqm != null ? t("property.sqm", { sqm: bbrData.basementSqm }) : null,
    },
    { label: t("bbrFacts.toiletCount"), value: bbrData?.toiletCount != null ? String(bbrData.toiletCount) : null },
    {
      label: t("bbrFacts.bathroomCount"),
      value: bbrData?.bathroomCount != null ? String(bbrData.bathroomCount) : null,
    },
  ];

  return (
    <div className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
      <h3 className="font-mono text-[10.5px] uppercase tracking-widest text-ink-faint">{t("bbrFacts.title")}</h3>
      {bbrData ? (
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="flex items-center justify-between gap-2 rounded-full border border-border bg-surface-alt px-3.5 py-2"
            >
              <dt className="text-xs font-semibold text-ink-soft">{fact.label}</dt>
              <dd className={`text-xs font-bold ${fact.value ? "text-ink" : "text-ink-faint"}`}>
                {fact.value ?? t("bbrFacts.noValue")}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 rounded-full border border-dashed border-border-strong px-4 py-2.5 text-center text-xs font-semibold text-ink-faint">
          {t("bbrFacts.noData")}
        </p>
      )}
    </div>
  );
}

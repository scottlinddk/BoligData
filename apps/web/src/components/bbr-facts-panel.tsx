import type { BbrData } from "@shared/types/index";
import type { FactSource } from "@/lib/property-facts";
import { useI18n } from "@/i18n/i18n";

interface BbrFactsPanelProps {
  bbrData: BbrData | null;
  /** Registered plot area from Matriklen — BBR keys plot size off the cadastre, so the panel shows it alongside the building facts. */
  plotSqm: number | null;
  /**
   * Whether these facts came from this request's live register read or from
   * the stored enrichment row. Rows written before the sources went live still
   * hold mock values, so the distinction is worth showing rather than implying.
   */
  source?: FactSource | null;
  matrikelnr?: string | null;
  ejerlav?: string | null;
  bfeNummer?: string | null;
}

/**
 * BBR building-facts panel: grid of label/value pairs (heating, materials,
 * floors, areas, toilet/bathroom counts) plus the cadastral identifiers the
 * address register resolves. Null facts are omitted, and the whole panel falls
 * back to a dashed "no enrichment data yet" state when there's nothing to
 * show — mirrors the prototype's hasFacts/!hasFacts split.
 */
export function BbrFactsPanel({
  bbrData,
  plotSqm,
  source = null,
  matrikelnr = null,
  ejerlav = null,
  bfeNummer = null,
}: BbrFactsPanelProps) {
  const { t } = useI18n();

  const rows = [
    { label: t("bbrFacts.heating"), value: bbrData?.heatingInstallation ?? null },
    { label: t("bbrFacts.wallMaterial"), value: bbrData?.wallMaterial ?? null },
    { label: t("bbrFacts.roofMaterial"), value: bbrData?.roofMaterial ?? null },
    { label: t("bbrFacts.floors"), value: bbrData?.floors != null ? String(bbrData.floors) : null },
    { label: t("bbrFacts.plotSqm"), value: plotSqm != null ? t("property.sqm", { sqm: plotSqm }) : null },
    {
      label: t("bbrFacts.basementSqm"),
      value: bbrData?.basementSqm ? t("property.sqm", { sqm: bbrData.basementSqm }) : null,
    },
    { label: t("bbrFacts.toiletCount"), value: bbrData?.toiletCount != null ? String(bbrData.toiletCount) : null },
    {
      label: t("bbrFacts.bathroomCount"),
      value: bbrData?.bathroomCount != null ? String(bbrData.bathroomCount) : null,
    },
    { label: t("bbrFacts.matrikelnr"), value: matrikelnr },
    { label: t("bbrFacts.ejerlav"), value: ejerlav },
    { label: t("bbrFacts.bfeNummer"), value: bfeNummer },
  ].filter((row): row is { label: string; value: string } => row.value !== null);

  const title = (
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="text-[15px] font-extrabold text-ink">{t("bbrFacts.title")}</h3>
      <span className="ds-mono rounded-[5px] border border-border px-1.5 py-0.5 text-[9px] text-ink-faint">BBR</span>
      {source !== null && (
        <span
          className={`ds-mono rounded-[5px] px-1.5 py-0.5 text-[9px] ${
            source === "register" ? "bg-success-soft text-success" : "bg-surface-alt text-ink-faint"
          }`}
        >
          {source === "register" ? t("register.badgeLive") : t("register.badgeStored")}
        </span>
      )}
    </div>
  );

  if (!bbrData || rows.length === 0) {
    return (
      <div className="rounded-[20px] border border-dashed border-border-strong p-4">
        {title}
        <p className="mt-2 text-[12.5px] text-ink-faint">{t("bbrFacts.noData")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
      {title}
      <dl className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="ds-mono text-[9.5px] text-ink-faint">{row.label}</dt>
            <dd className="mt-0.5 text-[13.5px] font-semibold text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

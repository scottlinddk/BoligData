import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getComparables, getProperty } from "@/lib/api";
import { formatDkk, pricePerSqm, daysBetween } from "@shared/utils/price";
import { DueDiligenceChecklist } from "@/components/due-diligence-checklist";
import { ComparablesPanel } from "@/components/comparables-panel";
import { PropertyMap } from "@/components/property-map";
import { useI18n } from "@/i18n/i18n";

export function PropertyDetailPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();

  const detailQuery = useQuery({
    queryKey: ["property", id],
    queryFn: () => getProperty(id!),
    enabled: !!id,
  });

  const comparablesQuery = useQuery({
    queryKey: ["comparables", id],
    queryFn: () => getComparables(id!),
    enabled: !!id,
  });

  if (detailQuery.isLoading) return <p className="p-6 font-semibold text-ink-soft">{t("detail.loading")}</p>;
  if (detailQuery.isError || !detailQuery.data)
    return <p className="p-6 font-semibold text-danger">{t("detail.notFound")}</p>;

  const { property, enrichment } = detailQuery.data;
  const empty = t("detail.empty");

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="font-serif text-4xl italic text-ink">{property.address}</h1>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        {property.municipality}
        {property.postalCode ? ` · ${property.postalCode}` : ""}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label={t("detail.price")} value={formatDkk(property.price)} />
        <Stat label={t("detail.size")} value={t("property.sqm", { sqm: property.sqm })} />
        <Stat label={t("detail.pricePerSqm")} value={formatDkk(pricePerSqm(property.price, property.sqm))} />
        <Stat label={t("detail.daysOnMarket")} value={String(daysBetween(property.listingDate))} />
        <Stat label={t("detail.rooms")} value={property.rooms ? String(property.rooms) : empty} />
        <Stat label={t("detail.built")} value={property.buildingYear ? String(property.buildingYear) : empty} />
        <Stat label={t("detail.energyLabel")} value={enrichment?.bbrData.energyLabel ?? empty} />
        <Stat
          label={t("detail.renovated")}
          value={enrichment?.bbrData.renovationYear ? String(enrichment.bbrData.renovationYear) : empty}
        />
      </div>

      {property.description && <p className="mt-4 text-sm leading-relaxed text-ink-soft">{property.description}</p>}

      <div className="mt-6 h-64 overflow-hidden rounded-2xl border border-border">
        <PropertyMap properties={[property]} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <DueDiligenceChecklist riskFlags={enrichment?.riskFlags ?? null} />
        {comparablesQuery.isLoading && <p className="p-3 font-semibold text-ink-soft">{t("comparables.loading")}</p>}
        {comparablesQuery.isError && (
          <div className="flex items-center gap-3 rounded-2xl border border-danger-soft bg-danger-soft p-4">
            <p className="font-semibold text-danger">{t("comparables.error")}</p>
            <button
              onClick={() => comparablesQuery.refetch()}
              className="rounded-lg bg-danger px-3 py-1.5 text-sm font-bold text-white"
            >
              {t("common.retry")}
            </button>
          </div>
        )}
        {comparablesQuery.data && (
          <ComparablesPanel
            soldPriceHistory={enrichment?.soldPriceHistory ?? []}
            comparables={comparablesQuery.data.comparables}
            neighborhoodAvgPricePerSqm={comparablesQuery.data.neighborhoodAvgPricePerSqm}
          />
        )}
      </div>

      {property.agentName && (
        <p className="mt-4 text-xs font-semibold text-ink-faint">{t("detail.listedBy", { name: property.agentName })}</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-faint">{label}</div>
      <div className="mt-0.5 font-serif text-xl text-ink">{value}</div>
    </div>
  );
}

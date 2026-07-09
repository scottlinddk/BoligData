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

  if (detailQuery.isLoading) return <p className="p-6 text-slate-500 dark:text-slate-400">{t("detail.loading")}</p>;
  if (detailQuery.isError || !detailQuery.data)
    return <p className="p-6 text-red-600 dark:text-red-400">{t("detail.notFound")}</p>;

  const { property, enrichment } = detailQuery.data;
  const empty = t("detail.empty");

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{property.address}</h1>
      <p className="text-slate-500 dark:text-slate-400">
        {property.municipality}
        {property.postalCode ? ` · ${property.postalCode}` : ""}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
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

      {property.description && <p className="mt-4 text-slate-700 dark:text-slate-300">{property.description}</p>}

      <div className="mt-6 h-64 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        <PropertyMap properties={[property]} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DueDiligenceChecklist riskFlags={enrichment?.riskFlags ?? null} />
        {comparablesQuery.data && (
          <ComparablesPanel
            soldPriceHistory={enrichment?.soldPriceHistory ?? []}
            comparables={comparablesQuery.data.comparables}
            neighborhoodAvgPricePerSqm={comparablesQuery.data.neighborhoodAvgPricePerSqm}
          />
        )}
      </div>

      {property.agentName && (
        <p className="mt-4 text-sm text-slate-400 dark:text-slate-500">
          {t("detail.listedBy", { name: property.agentName })}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs uppercase text-slate-400 dark:text-slate-500">{label}</div>
      <div className="font-semibold text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getComparables, getProperty } from "@/lib/api";
import { formatDkk, pricePerSqm, daysBetween } from "@shared/utils/price";
import { DueDiligenceChecklist } from "@/components/due-diligence-checklist";
import { ComparablesPanel } from "@/components/comparables-panel";
import { PropertyMap } from "@/components/property-map";

export function PropertyDetailPage() {
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

  if (detailQuery.isLoading) return <p className="p-6 text-slate-500">Loading...</p>;
  if (detailQuery.isError || !detailQuery.data) return <p className="p-6 text-red-600">Property not found.</p>;

  const { property, enrichment } = detailQuery.data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-slate-900">{property.address}</h1>
      <p className="text-slate-500">
        {property.municipality}
        {property.postalCode ? ` · ${property.postalCode}` : ""}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Price" value={formatDkk(property.price)} />
        <Stat label="Size" value={`${property.sqm} m²`} />
        <Stat label="Price/m²" value={formatDkk(pricePerSqm(property.price, property.sqm))} />
        <Stat label="Days on market" value={String(daysBetween(property.listingDate))} />
        <Stat label="Rooms" value={property.rooms ? String(property.rooms) : "—"} />
        <Stat label="Built" value={property.buildingYear ? String(property.buildingYear) : "—"} />
        <Stat label="Energy label" value={enrichment?.bbrData.energyLabel ?? "—"} />
        <Stat label="Renovated" value={enrichment?.bbrData.renovationYear ? String(enrichment.bbrData.renovationYear) : "—"} />
      </div>

      {property.description && <p className="mt-4 text-slate-700">{property.description}</p>}

      <div className="mt-6 h-64 overflow-hidden rounded-lg border border-slate-200">
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
        <p className="mt-4 text-sm text-slate-400">Listed by {property.agentName}</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs uppercase text-slate-400">{label}</div>
      <div className="font-semibold text-slate-900">{value}</div>
    </div>
  );
}

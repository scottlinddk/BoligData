import { Link } from "react-router-dom";
import type { Property } from "@shared/types/index";
import { formatDkk, pricePerSqm, daysBetween } from "@shared/utils/price";

export function PropertyCard({ property }: { property: Property }) {
  const daysOnMarket = daysBetween(property.listingDate);

  return (
    <Link
      to={`/property/${property.id}`}
      className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">{property.address}</h3>
          <p className="text-sm text-slate-500">
            {property.municipality}
            {property.postalCode ? ` · ${property.postalCode}` : ""}
          </p>
        </div>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs uppercase text-slate-600">
          {property.listingSource}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="text-lg font-semibold text-slate-900">{formatDkk(property.price)}</span>
        <span className="text-slate-500">{property.sqm} m²</span>
        <span className="text-slate-500">
          {formatDkk(pricePerSqm(property.price, property.sqm))}/m²
        </span>
        <span className="text-slate-500">{daysOnMarket} days on market</span>
      </div>
      {property.agentName && (
        <p className="mt-2 text-xs text-slate-400">{property.agentName}</p>
      )}
    </Link>
  );
}

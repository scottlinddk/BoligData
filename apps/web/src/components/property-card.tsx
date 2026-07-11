import { Link } from "react-router-dom";
import type { Property } from "@shared/types/index";
import { formatDkk, pricePerSqm, daysBetween } from "@shared/utils/price";
import { useI18n } from "@/i18n/i18n";

export function PropertyCard({ property }: { property: Property }) {
  const { t } = useI18n();
  const daysOnMarket = daysBetween(property.listingDate);

  return (
    <Link
      to={`/property/${property.id}`}
      className="block rounded-2xl border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:border-border-strong"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-ink">{property.address}</h3>
          <p className="mt-0.5 text-xs font-semibold text-ink-soft">
            {property.municipality}
            {property.postalCode ? ` · ${property.postalCode}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-border bg-paper px-2 py-1 font-mono text-[9.5px] text-ink-soft">
          {property.listingSource}
        </span>
      </div>
      <div className="mt-2.5 font-serif text-2xl italic leading-none text-ink">{formatDkk(property.price)}</div>
      <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1 text-xs font-semibold text-ink-soft">
        <span>{t("property.sqm", { sqm: property.sqm })}</span>
        <span>{t("property.pricePerSqm", { price: formatDkk(pricePerSqm(property.price, property.sqm)) })}</span>
        <span>{t("property.daysOnMarket", { days: daysOnMarket })}</span>
      </div>
      {property.agentName && <p className="mt-2 text-xs font-medium text-ink-faint">{property.agentName}</p>}
    </Link>
  );
}

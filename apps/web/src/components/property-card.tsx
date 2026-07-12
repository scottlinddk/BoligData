import { Link } from "react-router-dom";
import type { MouseEvent } from "react";
import type { Property } from "@shared/types/index";
import { formatDkk, pricePerSqm, daysBetween } from "@shared/utils/price";
import { getImageUrl, getPhotos } from "@shared/utils/image";
import { useI18n } from "@/i18n/i18n";
import { useSavedProperties } from "@/hooks/use-saved-properties";
import { useToast } from "@/components/toast";

export function PropertyCard({ property }: { property: Property }) {
  const { t } = useI18n();
  const { isSaved, toggle } = useSavedProperties();
  const { showToast } = useToast();
  const daysOnMarket = daysBetween(property.listingDate);
  const photos = getPhotos(property.images);
  const photoUrl = photos[0] ? getImageUrl(photos[0], 300, 200) : null;
  const saved = isSaved(property.id);

  async function handleSave(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const nowSaved = await toggle(property.id);
    showToast(nowSaved ? t("property.toastSaved") : t("property.toastUnsaved"), nowSaved ? "success" : "info");
  }

  return (
    <Link
      to={`/property/${property.id}`}
      className="block overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition hover:-translate-y-0.5 hover:border-border-strong"
    >
      <div className="relative h-[150px] overflow-hidden bg-surface-alt">
        {photoUrl ? (
          <img src={photoUrl} alt={property.address} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-faint">
            <span className="font-mono text-[9px]">{t("property.noPhoto")}</span>
          </div>
        )}
        <span className="absolute left-2.5 top-2.5 rounded-md border border-border bg-surface px-2 py-1 font-mono text-[9.5px] text-ink-soft">
          {property.listingSource}
        </span>
        <button
          type="button"
          onClick={handleSave}
          aria-label={saved ? t("property.saved") : t("property.save")}
          className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-surface text-[13px] shadow-card"
        >
          {saved ? "♥" : "♡"}
        </button>
        {photos.length > 1 && (
          <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {photos.length}
          </span>
        )}
      </div>
      <div className="p-3.5">
        <h3 className="text-[15.5px] font-semibold text-ink">{property.address}</h3>
        <p className="mt-0.5 text-xs font-semibold text-ink-soft">
          {property.municipality}
          {property.postalCode ? ` · ${property.postalCode}` : ""}
        </p>
        <div className="mt-2.5 font-serif text-2xl italic leading-none text-ink">{formatDkk(property.price)}</div>
        <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1 text-xs font-semibold text-ink-soft">
          <span>{t("property.sqm", { sqm: property.sqm })}</span>
          <span>{t("property.pricePerSqm", { price: formatDkk(pricePerSqm(property.price, property.sqm)) })}</span>
          <span>{t("property.daysOnMarket", { days: daysOnMarket })}</span>
        </div>
        {property.agentName && <p className="mt-2 text-xs font-medium text-ink-faint">{property.agentName}</p>}
      </div>
    </Link>
  );
}

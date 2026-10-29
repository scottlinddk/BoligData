import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { Property } from "@shared/types/index";
import { formatAskingPrice } from "@shared/utils/price";
import { getImageUrl, getPhotos } from "@shared/utils/image";
import { useI18n } from "@/i18n/i18n";
import { BrandMark } from "@/components/brand-mark";

interface MapListingCarouselProps {
  properties: Property[];
  selectedId: string | null;
}

/** Phone map view: swipeable listing cards under the map. A tapped pin brings its card into view. */
export function MapListingCarousel({ properties, selectedId }: MapListingCarouselProps) {
  const { t, language } = useI18n();
  const items = useRef(new Map<string, HTMLAnchorElement>());

  useEffect(() => {
    if (!selectedId) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    items.current.get(selectedId)?.scrollIntoView({ inline: "center", block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [selectedId]);

  if (properties.length === 0) return null;
  return <ul aria-label={language === "da" ? "Boliger på kortet" : "Homes on the map"}
    className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {properties.map(property => {
      const photo = getPhotos(property.images)[0];
      const selected = property.id === selectedId;
      return <li key={property.id} className="w-[84%] max-w-sm shrink-0 snap-center">
        <Link ref={element => { if (element) items.current.set(property.id, element); else items.current.delete(property.id); }}
          to={`/property/${property.id}`} aria-current={selected ? "true" : undefined}
          className={`flex gap-3 rounded-[20px] border bg-surface p-2.5 shadow-card transition-colors ${selected ? "border-brand ring-1 ring-brand" : "border-border"}`}>
          <span className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-surface-alt">
            {photo ? <img src={getImageUrl(photo, 300, 300)} alt="" loading="lazy" className="h-full w-full object-cover" />
              : <span className="flex h-full w-full items-center justify-center text-ink-faint"><BrandMark className="h-8 w-8 opacity-40" /></span>}
          </span>
          <span className="flex min-w-0 flex-1 flex-col justify-center">
            <span className="text-[17px] font-semibold leading-6 tracking-[-0.035em] text-ink">{formatAskingPrice(property.price)}</span>
            <span className="mt-0.5 truncate text-sm font-medium text-ink">{property.address}</span>
            <span className="mt-1 flex items-center gap-1.5 text-xs text-ink-soft">
              <span>{t("property.sqm", { sqm: property.sqm })}</span>
              {property.rooms != null && property.rooms > 0 && <><span aria-hidden="true">·</span><span>{property.rooms} {language === "da" ? "rum" : "rooms"}</span></>}
            </span>
          </span>
        </Link>
      </li>;
    })}
  </ul>;
}

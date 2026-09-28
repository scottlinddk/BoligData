import { Link } from "react-router-dom";
import type { MouseEvent } from "react";
import type { Property } from "@shared/types/index";
import { overallRisk } from "@shared/utils/risk-status";
import { formatDkk, pricePerSqm, daysBetween } from "@shared/utils/price";
import { getImageSrcSet, getImageUrl, getPhotos } from "@shared/utils/image";
import { useI18n } from "@/i18n/i18n";
import { useSavedProperties } from "@/hooks/use-saved-properties";
import { useToast } from "@/components/toast";
import { BrandMark } from "./brand-mark";

const CARD_IMAGE_WIDTHS = [400, 600, 800, 1200, 1600];
const CARD_IMAGE_ASPECT = 8 / 5;
const RISK_CHIP_STYLES = {
  ok: "bg-success-soft text-success-text",
  warning: "bg-warning-soft text-warning-text",
  unknown: "bg-unknown-soft text-unknown-text",
} as const;
const RISK_CHIP_KEY = { ok: "riskChip.ok", warning: "riskChip.flagged", unknown: "riskChip.unknown" } as const;

interface PropertyCardProps {
  property: Property;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function PropertyCard({ property, selectable, selected, onToggleSelect }: PropertyCardProps) {
  const { t, language } = useI18n();
  const { isSaved, toggle } = useSavedProperties();
  const { showToast } = useToast();
  const daysOnMarket = property.listingDate ? daysBetween(property.listingDate) : null;
  const photos = getPhotos(property.images);
  const photo = photos[0] ?? null;
  const photoUrl = photo ? getImageUrl(photo, 800, 500) : null;
  const photoSrcSet = photo ? getImageSrcSet(photo, CARD_IMAGE_WIDTHS, CARD_IMAGE_ASPECT) : undefined;
  const saved = isSaved(property.id);
  const risk = overallRisk(property.riskFlags);
  const locality = [property.postalCode, property.municipality].filter(Boolean).join(" ");
  const displayAddress = locality && !property.address.toLocaleLowerCase("da-DK").includes(property.municipality.toLocaleLowerCase("da-DK"))
    ? `${property.address}, ${locality}` : property.address;
  const daysLabel = daysOnMarket === null ? (language === "da" ? "Udbudstid ukendt" : "Listing time unknown") : t("property.daysOnMarket", { days: daysOnMarket });

  async function handleSave(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const nowSaved = await toggle(property.id);
    showToast(nowSaved ? t("property.toastSaved") : t("property.toastUnsaved"), nowSaved ? "success" : "info");
  }

  return <article className="group relative min-w-0" data-testid="property-card">
    <Link to={`/property/${property.id}`} className="block rounded-2xl text-ink">
      <div className="relative aspect-[8/5] overflow-hidden rounded-2xl bg-surface-alt">
        {photoUrl ? <img src={photoUrl} srcSet={photoSrcSet} sizes="(min-width: 1200px) 360px, (min-width: 640px) 45vw, 100vw" alt={property.address} loading="lazy"
          onError={event => { if (photo && event.currentTarget.src !== photo.url) { event.currentTarget.srcset = ""; event.currentTarget.src = photo.url; } }}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]" />
          : <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-faint"><BrandMark className="h-10 w-10 opacity-40" /><span className="text-xs">{t("property.noPhoto")}</span></div>}
        <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1.5 text-[10px] font-medium leading-none text-white backdrop-blur-sm">{property.listingSource}</span>
        <span title={t(RISK_CHIP_KEY[risk])} className={`absolute bottom-3 left-3 rounded-full px-2.5 py-1.5 text-[10px] font-medium leading-none ${RISK_CHIP_STYLES[risk]}`}>{t(RISK_CHIP_KEY[risk])}</span>
        {photos.length > 1 && <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1.5 text-[10px] leading-none text-white backdrop-blur-sm"><svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="1.5" y="3" width="13" height="10" rx="2" /><circle cx="8" cy="8" r="2.5" /></svg>{photos.length}</span>}
      </div>
      <div className="px-0.5 pb-1 pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
          <p className="text-[19px] font-semibold leading-6 tracking-[-0.035em]">{formatDkk(property.price)}</p>
          <p className="flex shrink-0 items-center gap-1.5 text-xs text-ink-soft"><span>{t("property.sqm", { sqm: property.sqm })}</span>{property.rooms != null && property.rooms > 0 && <><span aria-hidden="true">·</span><span title={language === "da" ? "Annoncerede rum, ikke dokumenterede soveværelser" : "Advertised rooms, not documented bedrooms"}>{property.rooms} {language === "da" ? "rum" : "rooms"}</span></>}</p>
        </div>
        <h3 className="mt-2 text-sm font-medium leading-5 transition-colors group-hover:text-brand-text">{displayAddress}</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-5 text-ink-soft">
          <span>{t("property.pricePerSqm", { price: formatDkk(pricePerSqm(property.price, property.sqm)) })}</span><span aria-hidden="true">·</span><span>{daysLabel}</span>
          {property.bbrData?.energyLabel && <span title={t("property.bbr.energyLabelTitle")} className="rounded border border-border px-1.5 font-semibold">{property.bbrData.energyLabel}</span>}
          {property.bbrData?.heatingInstallation && <span title={t("property.bbr.heatingTitle")}>{property.bbrData.heatingInstallation}</span>}
        </div>
        <p className="mt-2 text-[10px] font-medium leading-4 text-ink-faint">{property.agentName || property.listingSource}</p>
      </div>
    </Link>
    <button type="button" onClick={handleSave} aria-label={saved ? t("property.saved") : t("property.save")} aria-pressed={saved} className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full shadow-card transition-colors ${saved ? "bg-accent text-accent-text hover:bg-accent-hover" : "bg-surface text-ink-soft hover:bg-surface-hover"}`}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg>
    </button>
    {selectable && <button type="button" onClick={() => onToggleSelect?.(property.id)} aria-label={t("recommend.selectListing")} title={t("recommend.selectListing")} aria-pressed={selected} className={`absolute left-3 top-12 flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-bold transition-colors ${selected ? "border-cta bg-cta text-cta-text" : "border-border bg-surface text-transparent hover:border-cta"}`}>✓</button>}
  </article>;
}

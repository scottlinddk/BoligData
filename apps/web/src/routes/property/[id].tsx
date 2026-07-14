import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ApiError, getComparables, getProperty } from "@/lib/api";
import { formatDkk, pricePerSqm, daysBetween } from "@shared/utils/price";
import { getFloorplan, getImageUrl, getPhotos } from "@shared/utils/image";
import { calculateDueDiligenceScore } from "@shared/utils/due-diligence-score";
import { BbrFactsPanel } from "@/components/bbr-facts-panel";
import { DueDiligenceChecklist } from "@/components/due-diligence-checklist";
import { DueDiligenceScoreBadge } from "@/components/due-diligence-score-badge";
import { ComparablesPanel } from "@/components/comparables-panel";
import { PropertyGallery } from "@/components/property-gallery";
import { PropertyMap } from "@/components/property-map";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSavedProperties } from "@/hooks/use-saved-properties";
import { useToast } from "@/components/toast";

export function PropertyDetailPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const { isSaved, toggle } = useSavedProperties();
  const { showToast } = useToast();

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
  if (detailQuery.error instanceof ApiError && detailQuery.error.status === 401) {
    return (
      <p className="p-6 font-semibold text-danger">
        {t("search.signInForDetails")}{" "}
        <Link to="/auth/signin" className="underline">
          {t("nav.signIn")}
        </Link>
      </p>
    );
  }
  if (detailQuery.isError || !detailQuery.data)
    return <p className="p-6 font-semibold text-danger">{t("detail.notFound")}</p>;

  const { property, enrichment } = detailQuery.data;
  const empty = t("detail.empty");
  const dueDiligenceScore = calculateDueDiligenceScore(
    enrichment?.riskFlags ?? null,
    pricePerSqm(property.price, property.sqm),
    comparablesQuery.data?.neighborhoodAvgPricePerSqm ?? null,
  );
  const saved = isSaved(property.id);
  const photos = getPhotos(property.images);
  const floorplan = getFloorplan(property.images);

  async function handleSave() {
    const nowSaved = await toggle(property.id);
    showToast(nowSaved ? t("property.toastSaved") : t("property.toastUnsaved"), nowSaved ? "success" : "info");
  }

  function handleContactAgent() {
    showToast(t("detail.contactAgentComingSoon"), "info");
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 py-4 pb-24 md:pb-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-1.5 flex items-center gap-1.5 py-2 text-[13px] font-bold text-ink-soft hover:text-ink"
      >
        ← {t("detail.back")}
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="ds-display text-3xl text-ink md:text-4xl">{property.address}</h1>
          <p className="mt-1 text-sm font-semibold text-ink-soft">
            {property.municipality}
            {property.postalCode ? ` · ${property.postalCode}` : ""}
          </p>
        </div>
        {!isMobile && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-full border border-border-strong bg-surface px-5 py-2.5 text-sm font-bold text-ink hover:bg-surface-hover"
            >
              {saved ? t("property.saved") : t("property.save")}
            </button>
            <button
              type="button"
              onClick={handleContactAgent}
              className="rounded-full bg-cta px-5 py-2.5 text-sm font-bold text-cta-text hover:bg-cta-hover"
            >
              {t("detail.contactAgent")}
            </button>
          </div>
        )}
      </div>

      <div className="mt-4">
        <DueDiligenceScoreBadge breakdown={dueDiligenceScore} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
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
        <Stat label={t("detail.floors")} value={enrichment?.bbrData.floors ? String(enrichment.bbrData.floors) : empty} />
        <Stat label={t("detail.roofMaterial")} value={enrichment?.bbrData.roofMaterial ?? empty} />
        <Stat label={t("detail.wallMaterial")} value={enrichment?.bbrData.wallMaterial ?? empty} />
        <Stat
          label={t("detail.zone")}
          value={property.zone ? t(`zone.${property.zone}` as TranslationKey) : empty}
        />
        <Stat
          label={t("detail.parcelArea")}
          value={property.registeredAreaSqm ? t("property.sqm", { sqm: property.registeredAreaSqm }) : empty}
        />
        <Stat
          label={t("detail.publicValuation")}
          value={
            enrichment?.publicValuation?.assessedPropertyValueDkk
              ? formatDkk(enrichment.publicValuation.assessedPropertyValueDkk) +
                (enrichment.publicValuation.valuationYear ? ` (${enrichment.publicValuation.valuationYear})` : "")
              : empty
          }
        />
        <Stat
          label={t("detail.landValue")}
          value={
            enrichment?.publicValuation?.assessedLandValueDkk
              ? formatDkk(enrichment.publicValuation.assessedLandValueDkk)
              : empty
          }
        />
      </div>

      {property.description && <p className="mt-4 text-sm leading-relaxed text-ink-soft">{property.description}</p>}

      <div className="relative mt-6 h-[260px] overflow-hidden rounded-[20px] border border-border bg-surface-alt">
        {photos[0] ? (
          <img
            src={getImageUrl(photos[0], 1440, 960)}
            alt={property.address}
            onError={(e) => {
              if (photos[0] && e.currentTarget.src !== photos[0].url) e.currentTarget.src = photos[0].url;
            }}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-ink-faint">
            <span className="font-mono text-[10.5px]">{t("property.noPhoto")}</span>
          </div>
        )}
        {photos.length > 1 && (
          <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/55 px-2 py-1 text-[11px] font-bold text-white">
            {photos.length}
          </span>
        )}
      </div>

      {floorplan && (
        <div className="mt-6">
          <h2 className="text-xl font-bold tracking-tight text-ink">{t("detail.floorplan")}</h2>
          <div className="mt-2.5 overflow-hidden rounded-[20px] border border-border bg-surface-alt">
            <img
              src={getImageUrl(floorplan, 1440, 960)}
              alt={t("detail.floorplan")}
              onError={(e) => {
                if (e.currentTarget.src !== floorplan.url) e.currentTarget.src = floorplan.url;
              }}
              className="max-h-[600px] w-full object-contain"
            />
          </div>
        </div>
      )}

      <PropertyGallery images={photos.slice(1)} alt={property.address} />

      <div className="mt-4 h-[190px] overflow-hidden rounded-[20px] border border-border">
        <PropertyMap properties={[property]} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <DueDiligenceChecklist riskFlags={enrichment?.riskFlags ?? null} />
        {comparablesQuery.isLoading && <p className="p-3 font-semibold text-ink-soft">{t("comparables.loading")}</p>}
        {comparablesQuery.isError && (
          <div className="flex items-center gap-3 rounded-[20px] border border-danger-soft bg-danger-soft p-4">
            <p className="font-semibold text-danger">{t("comparables.error")}</p>
            <button
              onClick={() => comparablesQuery.refetch()}
              className="rounded-full bg-danger px-4 py-1.5 text-sm font-bold text-white"
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

      <div className="mt-3.5">
        <BbrFactsPanel bbrData={enrichment?.bbrData ?? null} plotSqm={property.registeredAreaSqm} />
      </div>

      {property.agentName && (
        <p className="mt-4 text-xs font-semibold text-ink-faint">{t("detail.listedBy", { name: property.agentName })}</p>
      )}

      {isMobile && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2.5 border-t border-border bg-surface px-4 py-2.5 shadow-lift">
          <button
            type="button"
            onClick={handleSave}
            aria-label={saved ? t("property.saved") : t("property.save")}
            className="w-[46px] shrink-0 rounded-full border border-border bg-surface text-base text-ink"
          >
            {saved ? "♥" : "♡"}
          </button>
          <button
            type="button"
            onClick={handleContactAgent}
            className="flex-1 rounded-full bg-cta px-3 py-3 text-sm font-bold text-cta-text"
          >
            {t("detail.contactAgent")}
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5 rounded-full border border-border bg-surface px-4 py-2">
      <span className="text-[14.5px] font-bold text-ink">{value}</span>
      <span className="ds-mono text-[9px] text-ink-faint">{label}</span>
    </div>
  );
}

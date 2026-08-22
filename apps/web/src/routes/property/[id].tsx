import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ListingSource } from "@shared/types/index";
import { ApiError, getComparables, getProperty, getPropertyLookup } from "@/lib/api";
import { formatDkk, pricePerSqm, daysBetween } from "@shared/utils/price";
import { getFloorplan, getImageSrcSet, getImageUrl, getPhotos } from "@shared/utils/image";
import { calculateDueDiligenceScore } from "@shared/utils/due-diligence-score";
import { mergePropertyFacts, summarizeLookupSources } from "@/lib/property-facts";
import { BbrFactsPanel } from "@/components/bbr-facts-panel";
import { RegisterSourcesPanel } from "@/components/register-sources-panel";
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
import { useState } from "react";
import { useUserProfile } from "@/hooks/use-user-profile";
import { RecommendModal } from "@/components/recommend-modal";

/**
 * The detail column is 900px at most, so 1800px covers a 2x phone and desktop
 * retina alike; the smaller steps keep narrow phones off the biggest file.
 */
const HERO_IMAGE_WIDTHS = [600, 900, 1200, 1800, 2400];
const HERO_IMAGE_ASPECT = 3 / 2;

/** Proper nouns, not translatable strings — the same in both languages. */
const SOURCE_NAMES: Record<ListingSource, string> = {
  boligsiden: "Boligsiden",
  boliga: "Boliga",
};

/**
 * Link out to the broker's own listing, which is where the full description,
 * viewing times and sales material live — BoligData only mirrors the parts it
 * can analyse. Rendered only when the crawl captured a URL (`listingUrl`),
 * never from a guessed pattern, so the link can't 404.
 */
function BrokerListingLink({
  url,
  source,
  className,
}: {
  url: string;
  source: ListingSource;
  className: string;
}) {
  const { t } = useI18n();
  const sourceName = SOURCE_NAMES[source];
  return (
    <a
      href={url}
      target="_blank"
      // noreferrer as well as noopener: the target is a third-party site we
      // don't control, and it has no business seeing the user's BoligData path.
      rel="noopener noreferrer"
      title={t("detail.brokerListingOn", { source: sourceName })}
      className={className}
    >
      {t("detail.brokerListing")} <span aria-hidden="true">↗</span>
    </a>
  );
}

export function PropertyDetailPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const { isSaved, toggle } = useSavedProperties();
  const { showToast } = useToast();
  const { profile } = useUserProfile();
  const canRecommend = profile?.role === "advisor" || profile?.role === "agent";
  const [recommendOpen, setRecommendOpen] = useState(false);

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

  // Live register read for this address. Deliberately a second request rather
  // than something the detail endpoint inlines: /api/property-lookup is open
  // and CDN-cached per query string, while /api/properties is per-caller, so
  // folding it in would make every detail request pay for register latency and
  // lose the shared cache. It also means the page renders immediately from the
  // stored row and upgrades in place when the registers answer.
  const listing = detailQuery.data?.property;
  const lookupQuery = useQuery({
    queryKey: ["property-lookup", listing?.id],
    queryFn: () =>
      getPropertyLookup({
        address: listing!.address,
        askingPrice: listing!.price,
        postalCode: listing!.postalCode,
        lat: listing!.lat,
        lon: listing!.lon,
        roomCount: listing!.rooms,
        energyLabel: detailQuery.data?.enrichment?.bbrData.energyLabel ?? null,
      }),
    enabled: !!listing,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (detailQuery.isLoading) return <PropertyDetailSkeleton />;
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
  const facts = mergePropertyFacts(property, enrichment, lookupQuery.data ?? null);
  const registerSources = summarizeLookupSources(lookupQuery.data ?? null);
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
            {property.listingUrl && (
              <BrokerListingLink
                url={property.listingUrl}
                source={property.listingSource}
                className="rounded-full border border-border-strong bg-surface px-5 py-2.5 text-sm font-bold text-ink hover:bg-surface-hover"
              />
            )}
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
            {canRecommend && (
              <button
                type="button"
                onClick={() => setRecommendOpen(true)}
                className="rounded-full border border-border-strong bg-surface px-5 py-2.5 text-sm font-bold text-ink hover:bg-surface-hover"
              >
                {t("recommend.cta")}
              </button>
            )}
          </div>
        )}
      </div>

      {recommendOpen && (
        <RecommendModal propertyIds={[property.id]} propertyCount={1} onClose={() => setRecommendOpen(false)} />
      )}

      <div className="mt-4">
        <DueDiligenceScoreBadge breakdown={dueDiligenceScore} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Stat label={t("detail.price")} value={formatDkk(property.price)} />
        <Stat label={t("detail.size")} value={t("property.sqm", { sqm: property.sqm })} />
        <Stat label={t("detail.pricePerSqm")} value={formatDkk(pricePerSqm(property.price, property.sqm))} />
        <Stat label={t("detail.daysOnMarket")} value={String(daysBetween(property.listingDate))} />
        <Stat label={t("detail.rooms")} value={property.rooms ? String(property.rooms) : empty} />
        <Stat label={t("detail.built")} value={facts.buildingYear ? String(facts.buildingYear) : empty} />
        <Stat label={t("detail.energyLabel")} value={facts.bbrData?.energyLabel ?? empty} />
        <Stat
          label={t("detail.renovated")}
          value={facts.renovationYear ? String(facts.renovationYear) : empty}
        />
        <Stat label={t("detail.floors")} value={facts.bbrData?.floors ? String(facts.bbrData.floors) : empty} />
        <Stat label={t("detail.roofMaterial")} value={facts.bbrData?.roofMaterial ?? empty} />
        <Stat label={t("detail.wallMaterial")} value={facts.bbrData?.wallMaterial ?? empty} />
        <Stat label={t("detail.zone")} value={facts.zone ? t(`zone.${facts.zone}` as TranslationKey) : empty} />
        <Stat
          label={t("detail.parcelArea")}
          value={property.registeredAreaSqm ? t("property.sqm", { sqm: property.registeredAreaSqm }) : empty}
        />
        <Stat
          label={t("detail.publicValuation")}
          value={
            facts.publicValuation?.assessedPropertyValueDkk
              ? formatDkk(facts.publicValuation.assessedPropertyValueDkk) +
                (facts.publicValuation.valuationYear ? ` (${facts.publicValuation.valuationYear})` : "")
              : empty
          }
        />
        <Stat
          label={t("detail.landValue")}
          value={facts.publicValuation?.assessedLandValueDkk ? formatDkk(facts.publicValuation.assessedLandValueDkk) : empty}
        />
        {facts.registerAreaSqm !== null && (
          <Stat
            label={t("detail.registerArea")}
            value={t("property.sqm", { sqm: facts.registerAreaSqm })}
            tone="warning"
            title={t("detail.registerAreaMismatch", { listing: String(property.sqm), register: String(facts.registerAreaSqm) })}
          />
        )}
      </div>

      {property.description && <p className="mt-4 text-sm leading-relaxed text-ink-soft">{property.description}</p>}

      <div className="relative mt-6 h-[300px] overflow-hidden rounded-[20px] border border-border bg-surface-alt sm:h-[420px] lg:h-[520px]">
        {photos[0] ? (
          <img
            src={getImageUrl(photos[0], 1800, 1200)}
            srcSet={getImageSrcSet(photos[0], HERO_IMAGE_WIDTHS, HERO_IMAGE_ASPECT)}
            sizes="(min-width: 900px) 900px, 100vw"
            alt={property.address}
            onError={(e) => {
              if (photos[0] && e.currentTarget.src !== photos[0].url) {
                e.currentTarget.srcset = "";
                e.currentTarget.src = photos[0].url;
              }
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

      {/* On mobile the action row above is replaced by the fixed bottom bar,
          which is already full of primary CTAs — so the broker link sits here
          instead, next to the photos it leads to more of. */}
      {isMobile && property.listingUrl && (
        <BrokerListingLink
          url={property.listingUrl}
          source={property.listingSource}
          className="mt-2.5 block rounded-full border border-border-strong bg-surface px-5 py-3 text-center text-sm font-bold text-ink"
        />
      )}

      {floorplan && (
        <div className="mt-6">
          <h2 className="text-xl font-bold tracking-tight text-ink">{t("detail.floorplan")}</h2>
          <div className="mt-2.5 overflow-hidden rounded-[20px] border border-border bg-surface-alt">
            <img
              src={getImageUrl(floorplan, 1800, 1200)}
              srcSet={getImageSrcSet(floorplan, HERO_IMAGE_WIDTHS, HERO_IMAGE_ASPECT)}
              sizes="(min-width: 900px) 900px, 100vw"
              alt={t("detail.floorplan")}
              onError={(e) => {
                if (e.currentTarget.src !== floorplan.url) {
                  e.currentTarget.srcset = "";
                  e.currentTarget.src = floorplan.url;
                }
              }}
              className="max-h-[760px] w-full object-contain"
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
        <ComparablesPanel
          soldPriceHistory={facts.priceHistory}
          priceHistorySource={facts.priceHistorySource}
          nearbySales={facts.nearbySales}
          comparables={comparablesQuery.data?.comparables ?? []}
          neighborhoodAvgPricePerSqm={comparablesQuery.data?.neighborhoodAvgPricePerSqm ?? null}
        />
      </div>

      <div className="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <BbrFactsPanel
          bbrData={facts.bbrData}
          plotSqm={property.registeredAreaSqm}
          source={facts.bbrSource}
          matrikelnr={facts.matrikelnr}
          ejerlav={facts.ejerlav}
          bfeNummer={facts.bfeNummer}
        />
        <RegisterSourcesPanel
          sources={registerSources}
          isLoading={lookupQuery.isLoading}
          isError={lookupQuery.isError}
          onRetry={() => lookupQuery.refetch()}
        />
      </div>

      {property.agentName && (
        <p className="mt-4 text-xs font-semibold text-ink-faint">{t("detail.listedBy", { name: property.agentName })}</p>
      )}

      {isMobile && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-border bg-surface px-4 py-2.5 shadow-lift">
          <div className="flex gap-2.5">
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
          {canRecommend && (
            <button
              type="button"
              onClick={() => setRecommendOpen(true)}
              className="w-full rounded-full border border-border-strong bg-surface px-3 py-3 text-sm font-bold text-ink"
            >
              {t("recommend.cta")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PropertyDetailSkeleton() {
  return (
    <div className="mx-auto max-w-[900px] px-4 py-4 pb-24 md:pb-6">
      <div className="mb-1.5 h-[17px] w-24 animate-pulse rounded bg-surface-alt" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="h-9 w-64 animate-pulse rounded bg-surface-alt md:h-10 md:w-96" />
          <div className="mt-2 h-4 w-40 animate-pulse rounded bg-surface-alt" />
        </div>
        <div className="hidden gap-2 md:flex">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[42px] w-32 animate-pulse rounded-full bg-surface-alt" />
          ))}
        </div>
      </div>

      <div className="mt-4 h-8 w-48 animate-pulse rounded-full bg-surface-alt" />

      <div className="mt-4 flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-[34px] w-28 animate-pulse rounded-full bg-surface-alt" />
        ))}
      </div>

      <div className="relative mt-6 h-[300px] animate-pulse rounded-[20px] bg-surface-alt sm:h-[420px] lg:h-[520px]" />

      <div className="mt-4 h-[190px] animate-pulse rounded-[20px] bg-surface-alt" />

      <div className="mt-5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-[20px] bg-surface-alt" />
        <div className="h-64 animate-pulse rounded-[20px] bg-surface-alt" />
      </div>

      <div className="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <div className="h-48 animate-pulse rounded-[20px] bg-surface-alt" />
        <div className="h-48 animate-pulse rounded-[20px] bg-surface-alt" />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
  title,
}: {
  label: string;
  value: string;
  /** "warning" marks a figure that disagrees with the listing — see `title` for the comparison. */
  tone?: "neutral" | "warning";
  title?: string;
}) {
  const toneClass =
    tone === "warning" ? "border-warning-soft bg-warning-soft" : "border-border bg-surface";
  return (
    <div className={`flex items-baseline gap-1.5 rounded-full border px-4 py-2 ${toneClass}`} title={title}>
      <span className="text-[14.5px] font-bold text-ink">{value}</span>
      <span className="ds-mono text-[9px] text-ink-faint">{label}</span>
    </div>
  );
}

import { useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ListingSource } from "@shared/types/index";
import { ApiError, getComparables, getProperty, getPropertyLookup } from "@/lib/api";
import { formatDkk, pricePerSqm } from "@shared/utils/price";
import { getFloorplan, getImageUrl, getPhotos } from "@shared/utils/image";
import { mergePropertyFacts, summarizeLookupSources } from "@/lib/property-facts";
import { researchListingTime } from "@/lib/research-listing-time";
import { BbrFactsPanel } from "@/components/bbr-facts-panel";
import { RegisterSourcesPanel } from "@/components/register-sources-panel";
import { DueDiligenceChecklist } from "@/components/due-diligence-checklist";
import { ResearchWorkbench } from "@/components/research/workbench";
import { WorkbookPriceReferenceCard } from "@/components/research/workbook-price-reference";
import { useListingHistory } from "@/hooks/use-listing-history";
import { ComparablesPanel } from "@/components/comparables-panel";
import { PropertyGallery } from "@/components/property-gallery";
import { PropertyMap } from "@/components/property-map";
import { SchoolDistrictPanel } from "@/components/school-district-panel";
import { Footer } from "@/components/footer";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import { useSavedProperties } from "@/hooks/use-saved-properties";
import { useToast } from "@/components/toast";
import { useUserProfile } from "@/hooks/use-user-profile";
import { RecommendModal } from "@/components/recommend-modal";
import { LimfjordNoisePanel } from "@/components/limfjord-noise-panel";

const SOURCE_NAMES: Record<ListingSource, string> = { boligsiden: "Boligsiden", boliga: "Boliga" };
const actionClass = "flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-colors";

function BrokerListingLink({ url, source, className }: { url: string; source: ListingSource; className: string }) {
  const { t } = useI18n();
  return <a href={url} target="_blank" rel="noopener noreferrer" title={t("detail.brokerListingOn", { source: SOURCE_NAMES[source] })} className={className}>
    {t("detail.brokerListing")} <span aria-hidden="true">↗</span>
  </a>;
}

export function PropertyDetailPage() {
  const { t, language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isSaved, toggle } = useSavedProperties();
  const { showToast } = useToast();
  const { profile } = useUserProfile();
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const researchDetails = useRef<HTMLDetailsElement>(null);
  const canRecommend = profile?.role === "advisor" || profile?.role === "agent";
  const detailQuery = useQuery({ queryKey: ["property", id], queryFn: () => getProperty(id!), enabled: !!id });
  const comparablesQuery = useQuery({ queryKey: ["comparables", id], queryFn: () => getComparables(id!), enabled: !!id });
  const listing = detailQuery.data?.property;
  const listingHistory = useListingHistory(listing?.id);
  const lookupQuery = useQuery({
    queryKey: ["property-lookup", listing?.id],
    queryFn: () => getPropertyLookup({ address: listing!.address, askingPrice: listing!.price, postalCode: listing!.postalCode,
      lat: listing!.lat, lon: listing!.lon, roomCount: listing!.rooms, energyLabel: detailQuery.data?.enrichment?.bbrData.energyLabel ?? null }),
    enabled: !!listing, staleTime: 5 * 60 * 1000, retry: 1,
  });

  if (detailQuery.isLoading) return <PropertyDetailSkeleton />;
  if (detailQuery.error instanceof ApiError && detailQuery.error.status === 401) return <p className="p-6 text-danger">{t("search.signInForDetails")} <Link to="/auth/signin" className="underline">{t("nav.signIn")}</Link></p>;
  if (detailQuery.isError || !detailQuery.data) return <p className="p-6 text-danger">{t("detail.notFound")}</p>;

  const { property, enrichment } = detailQuery.data;
  const empty = t("detail.empty");
  const facts = mergePropertyFacts(property, enrichment, lookupQuery.data ?? null);
  const registerSources = summarizeLookupSources(lookupQuery.data ?? null);
  const saved = isSaved(property.id);
  const photos = getPhotos(property.images);
  const floorplan = getFloorplan(property.images);
  const listingTime = researchListingTime(property, listingHistory.data);
  const days = listingTime.time.latestEpisodeDays;

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const nowSaved = await toggle(property.id);
      showToast(nowSaved ? t("property.toastSaved") : t("property.toastUnsaved"), nowSaved ? "success" : "info");
    } catch {
      showToast(tx("Boligen kunne ikke gemmes. Prøv igen.", "Could not save this home. Please try again."), "error");
    } finally { setSaving(false); }
  }
  function openResearch() {
    if (!researchDetails.current) return;
    researchDetails.current.open = true;
    researchDetails.current.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    researchDetails.current.querySelector("summary")?.focus({ preventScroll: true });
  }

  return <>
    <article className="mx-auto max-w-[1240px] px-4 pb-28 pt-6 sm:px-8 sm:pt-8 lg:pb-16">
      <nav aria-label={tx("Brødkrumme", "Breadcrumb")} className="mb-6 flex items-center gap-3 text-xs text-ink-soft">
        <button type="button" onClick={() => { if (window.history.state?.idx > 0) navigate(-1); else navigate("/"); }} className="rounded py-1 hover:text-ink">← {t("detail.back")}</button><span aria-hidden="true">/</span><span className="truncate text-ink">{property.address}</span>
      </nav>
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_320px] xl:gap-10">
        <div className="min-w-0 space-y-7">
          <PropertyGallery images={photos} alt={property.address} />
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium text-ink-soft">
              <span className="rounded-full bg-surface-alt px-3 py-1.5">{t(`propertyType.${property.propertyType}` as TranslationKey)}</span>
              <span className="rounded-full bg-surface-alt px-3 py-1.5">{property.status === "active" ? tx("Til salg", "For sale") : tx("Afsluttet udbud", "Listing closed")}</span>
            </div>
            <h1 className="ds-display text-3xl leading-tight text-ink sm:text-[40px]">{property.address}</h1>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-soft">
              <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M16 8c0 4-6 9-6 9S4 12 4 8a6 6 0 1 1 12 0Z" /><circle cx="10" cy="8" r="2" /></svg>
              {[property.postalCode, property.municipality].filter(Boolean).join(" ")}
            </p>
            <p className="mt-4 text-2xl font-semibold tracking-tight lg:hidden">{formatDkk(property.price)}</p>
            <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-5 border-y border-border py-5 sm:grid-cols-4">
              <Stat label={t("detail.size")} value={t("property.sqm", { sqm: property.sqm })} />
              <Stat label={t("detail.rooms")} value={property.rooms ? String(property.rooms) : empty} />
              <Stat label={t("detail.built")} value={facts.buildingYear ? String(facts.buildingYear) : empty} />
              <Stat label={t("detail.energyLabel")} value={facts.bbrData?.energyLabel ?? empty} />
            </dl>
            {facts.registerAreaSqm !== null && <p className="mt-3 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-text">{t("detail.registerAreaMismatch", { listing: String(property.sqm), register: String(facts.registerAreaSqm) })}</p>}
          </div>
          <div id="price-reference" className="scroll-mt-28 [&>section]:mt-0">
            <WorkbookPriceReferenceCard property={property} history={listingHistory.data} loading={listingHistory.isPending} failed={listingHistory.isError} onRetry={() => { void listingHistory.refetch(); }} />
          </div>
          {property.description && <section className="rounded-2xl bg-surface-alt p-5 sm:p-7">
            <h2 className="text-xl font-medium tracking-tight">{tx("Om boligen", "About this home")}</h2>
            {property.description.length > 500 ? <>
              <p className="mt-4 line-clamp-4 whitespace-pre-line text-sm leading-7 text-ink-soft">{property.description}</p>
              <details className="mt-3"><summary className="w-fit cursor-pointer text-sm font-semibold">{tx("Læs hele beskrivelsen", "Read the full description")}</summary><p className="mt-4 whitespace-pre-line text-sm leading-7 text-ink-soft">{property.description}</p></details>
            </> : <p className="mt-4 whitespace-pre-line text-sm leading-7 text-ink-soft">{property.description}</p>}
          </section>}
          <DetailSection title={tx("Fakta og bygningsoplysninger", "Facts and building details")} subtitle={tx("BBR, grund, materialer og offentlig vurdering", "Building records, plot, materials and public valuation")}>
            <dl className="mb-5 grid grid-cols-2 gap-5 sm:grid-cols-3">
              <Stat label={t("detail.renovated")} value={facts.renovationYear ? String(facts.renovationYear) : empty} />
              <Stat label={t("detail.floors")} value={facts.bbrData?.floors ? String(facts.bbrData.floors) : empty} />
              <Stat label={t("detail.roofMaterial")} value={facts.bbrData?.roofMaterial ?? empty} />
              <Stat label={t("detail.wallMaterial")} value={facts.bbrData?.wallMaterial ?? empty} />
              <Stat label={t("detail.zone")} value={facts.zone ? t(`zone.${facts.zone}` as TranslationKey) : empty} />
              <Stat label={t("detail.parcelArea")} value={property.registeredAreaSqm ? t("property.sqm", { sqm: property.registeredAreaSqm }) : empty} />
              <Stat label={t("detail.publicValuation")} value={facts.publicValuation?.assessedPropertyValueDkk ? `${formatDkk(facts.publicValuation.assessedPropertyValueDkk)}${facts.publicValuation.valuationYear ? ` (${facts.publicValuation.valuationYear})` : ""}` : empty} />
              <Stat label={t("detail.landValue")} value={facts.publicValuation?.assessedLandValueDkk ? formatDkk(facts.publicValuation.assessedLandValueDkk) : empty} />
            </dl>
            <BbrFactsPanel bbrData={facts.bbrData} plotSqm={property.registeredAreaSqm} source={facts.bbrSource} matrikelnr={facts.matrikelnr} ejerlav={facts.ejerlav} bfeNummer={facts.bfeNummer} />
          </DetailSection>
          {floorplan && <DetailSection title={t("detail.floorplan")} subtitle={tx("Se boligens indretning", "Explore the layout")}>
            <img src={getImageUrl(floorplan, 1800, 1200)} alt={t("detail.floorplan")} loading="lazy" className="max-h-[720px] w-full rounded-xl bg-white object-contain"
              onError={event => { if (event.currentTarget.src !== floorplan.url) event.currentTarget.src = floorplan.url; }} />
          </DetailSection>}
          <section className="rounded-2xl bg-surface-alt p-5 sm:p-7">
            <h2 className="text-xl font-medium tracking-tight">{tx("Her ligger boligen", "The neighbourhood")}</h2>
            <p className="mb-5 mt-1 text-sm text-ink-soft">{property.address} · {[property.postalCode, property.municipality].filter(Boolean).join(" ")}</p>
            <div className="h-[280px] overflow-hidden rounded-xl sm:h-[350px]"><PropertyMap properties={[property]} /></div>
          </section>
          <SchoolDistrictPanel propertyId={property.id} />
          <DetailSection title={tx("Handler og sammenlignelige boliger", "Sales and comparable homes")} subtitle={tx("Tidligere salg, handler i nærheden og pris pr. m²", "Previous sales, nearby transactions and price per m²")}>
            {comparablesQuery.isError && <div role="status" className="mb-4 rounded-xl bg-warning-soft p-4 text-sm text-warning-text"><p>{t("comparables.error")}</p><button type="button" onClick={() => { void comparablesQuery.refetch(); }} className="mt-2 font-semibold underline">{t("common.retry")}</button></div>}
            <ComparablesPanel soldPriceHistory={facts.priceHistory} priceHistorySource={facts.priceHistorySource} nearbySales={facts.nearbySales} comparables={comparablesQuery.data?.comparables ?? []} neighborhoodAvgPricePerSqm={comparablesQuery.data?.neighborhoodAvgPricePerSqm ?? null} />
          </DetailSection>
          <LimfjordNoisePanel propertyId={property.id} />
          <DetailSection title={tx("Dokumentation og opmærksomhedspunkter", "Documents and things to check")} subtitle={tx("Tjekliste og status for de offentlige kilder", "Checklist and public data source status")}>
            <div className="space-y-4"><DueDiligenceChecklist riskFlags={enrichment?.riskFlags ?? null} /><RegisterSourcesPanel sources={registerSources} isLoading={lookupQuery.isLoading} isError={lookupQuery.isError} onRetry={() => lookupQuery.refetch()} /></div>
          </DetailSection>
        </div>
        <aside aria-label={tx("Pris og næste skridt", "Price and next steps")} className="row-start-2 space-y-5 lg:col-start-2 lg:row-start-1">
          <div className="rounded-2xl bg-surface-alt p-6">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">{t("detail.price")}</p>
            <p className="mt-2 text-[32px] font-semibold tracking-[-0.04em]">{formatDkk(property.price)}</p>
            <p className="mt-1 text-sm text-ink-soft">{formatDkk(pricePerSqm(property.price, property.sqm))} / m²</p>
            <div className="my-5 flex items-center justify-between gap-3 border-y border-border py-4 text-sm"><span className="text-ink-soft">{tx("Aktuel liggetid", "Current time on market")}</span><span className="font-semibold">{days !== null ? `${days} ${tx("dage", "days")}` : empty}</span></div>
            <a href="#price-reference" className={`${actionClass} bg-accent text-accent-text hover:opacity-90`}>{tx("Se pris efter liggetid", "Price by time on market")} <span aria-hidden="true">↙</span></a>
            <button type="button" onClick={handleSave} disabled={saving} aria-pressed={saved} className={`${actionClass} mt-3 w-full border border-border-strong bg-surface text-ink hover:bg-surface-hover disabled:opacity-50`}><span aria-hidden="true">{saved ? "♥" : "♡"}</span>{saved ? t("property.saved") : t("property.save")}</button>
          </div>
          <section className="rounded-2xl bg-surface-alt p-6">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">{tx("Din næste fremvisning", "Your next viewing")}</p>
            <h2 className="mt-3 text-xl font-medium">{property.agentName || tx("Se mere hos mægleren", "Explore the agent's listing")}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{tx("Find fremvisning, salgsopstilling og kontaktoplysninger i den originale annonce.", "Find viewing times, sales documents and contact details in the original listing.")}</p>
            {property.listingUrl ? <BrokerListingLink url={property.listingUrl} source={property.listingSource} className={`${actionClass} mt-5 bg-cta text-cta-text hover:bg-cta-hover`} /> : <p className="mt-4 text-xs text-ink-soft">{tx("Link til mægleren er ikke oplyst.", "An agent listing link is not available.")}</p>}
            <button type="button" onClick={openResearch} className={`${actionClass} mt-3 w-full border border-border-strong text-ink hover:bg-surface-hover`}>{tx("Undersøg boligen", "Research this home")}</button>
            {canRecommend && <button type="button" onClick={() => setRecommendOpen(true)} className="mt-4 w-full rounded py-1 text-sm font-medium text-ink-soft underline underline-offset-4">{t("recommend.cta")}</button>}
          </section>
          <p className="px-2 text-xs leading-5 text-ink-faint">{tx("Annonce fra", "Listing from")} {SOURCE_NAMES[property.listingSource]} · {tx("Opdateret", "Updated")} {property.updatedAt.slice(0, 10)}</p>
        </aside>
      </div>
      <details ref={researchDetails} id="research-details" className="group mt-10 scroll-mt-28 rounded-2xl border border-border bg-surface-alt p-5 sm:p-7">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
          <div><span className="block text-2xl font-medium tracking-tight">{tx("Din boligundersøgelse", "Your property research")}</span><span className="mt-1 block text-sm text-ink-soft">{tx("Gå i dybden med pris, historik, budget og dine egne noter.", "Explore pricing, history, budget and your own notes.")}</span></div>
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-strong text-xl transition-transform group-open:rotate-45">+</span>
        </summary>
        <ResearchWorkbench property={property} facts={facts} />
      </details>
      {recommendOpen && <RecommendModal propertyIds={[property.id]} propertyCount={1} onClose={() => setRecommendOpen(false)} />}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-border bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:hidden">
        <div className="mr-auto min-w-0"><p className="text-[10px] uppercase tracking-wide text-ink-soft">{t("detail.price")}</p><p className="text-base font-semibold">{formatDkk(property.price)}</p></div>
        <button type="button" onClick={handleSave} disabled={saving} aria-pressed={saved} aria-label={saved ? t("property.saved") : t("property.save")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-strong text-xl disabled:opacity-50">{saved ? "♥" : "♡"}</button>
        {property.listingUrl ? <a href={property.listingUrl} target="_blank" rel="noopener noreferrer" className={`${actionClass} bg-cta text-cta-text`}>{tx("Se annonce", "View listing")} ↗</a> : <button type="button" onClick={openResearch} className={`${actionClass} bg-cta text-cta-text`}>{tx("Undersøg", "Research")}</button>}
      </div>
    </article>
    <Footer />
  </>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-ink-soft">{label}</dt><dd className="mt-1.5 break-words text-base font-medium text-ink">{value}</dd></div>;
}
function DetailSection({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <details className="group rounded-2xl bg-surface-alt p-5 sm:p-7">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden"><div><span className="block text-lg font-medium tracking-tight">{title}</span><span className="mt-1 block text-xs leading-5 text-ink-soft">{subtitle}</span></div><span aria-hidden="true" className="text-xl transition-transform group-open:rotate-45">+</span></summary>
    <div className="mt-6">{children}</div>
  </details>;
}
function PropertyDetailSkeleton() {
  return <div aria-busy="true" className="mx-auto max-w-[1240px] animate-pulse px-4 py-8 sm:px-8">
    <div className="mb-6 h-4 w-40 rounded bg-surface-alt" /><div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]"><div><div className="aspect-[3/2] rounded-2xl bg-surface-alt" /><div className="mt-7 h-10 w-2/3 rounded bg-surface-alt" /><div className="mt-4 h-5 w-1/3 rounded bg-surface-alt" /></div><div className="h-80 rounded-2xl bg-surface-alt" /></div>
  </div>;
}

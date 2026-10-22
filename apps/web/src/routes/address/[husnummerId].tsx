import { useEffect, useMemo, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDkk } from "@shared/utils/price";
import { ApiError, getPropertyLookup } from "@/lib/api";
import { isHusnummerId } from "@/lib/address-search";
import { buildAddressReport } from "@/lib/address-report";
import { BbrFactsPanel } from "@/components/bbr-facts-panel";
import { ComparablesPanel } from "@/components/comparables-panel";
import { DueDiligenceChecklist } from "@/components/due-diligence-checklist";
import { RegisterSourcesPanel } from "@/components/register-sources-panel";
import { SalesHistoryCard } from "@/components/sales-history-card";
import { SmartEstimateView } from "@/components/estimate/smart-estimate";
import { SparContent } from "@/components/spar-panel";
import { ZipPriceIndexCard } from "@/components/estimate/zip-price-index-card";
import { Footer } from "@/components/footer";
import { LoadingStatus, Skeleton, Spinner } from "@/components/ui/loading";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";

/**
 * Public-record report for one address, shown without a listing and therefore
 * without an asking price. Built from the same register lookup the listing page
 * uses, and from the same panels, so the two present facts the same way.
 */
export function AddressReportPage() {
  const { t } = useI18n();
  const { husnummerId = "" } = useParams<{ husnummerId: string }>();
  const valid = isHusnummerId(husnummerId);

  const lookupQuery = useQuery({
    queryKey: ["address-report", husnummerId],
    queryFn: () => getPropertyLookup({ address: "", husnummerId }),
    enabled: valid,
    staleTime: 5 * 60 * 1000,
    // Every request spends one of the account's hourly register lookups, so a failed one is retried by hand, not automatically.
    retry: false,
  });

  const report = useMemo(() => (lookupQuery.data ? buildAddressReport(lookupQuery.data) : null), [lookupQuery.data]);
  const title = report?.address || t("address.report.untitled");

  useEffect(() => {
    const appName = t("app.name");
    document.title = report?.address ? `${report.address} | ${appName}` : appName;
    return () => { document.title = appName; };
  }, [report?.address, t]);

  const newLookup = <Link to="/address" className="inline-flex min-h-11 items-center rounded py-1 text-sm text-ink-soft hover:text-ink">← {t("address.report.newLookup")}</Link>;
  const shell = (children: ReactNode) => <>
    <article className="ui-enter mx-auto max-w-3xl space-y-6 px-4 pb-24 pt-6 sm:px-8 sm:pt-10">{newLookup}{children}</article>
    <Footer />
  </>;

  if (!valid) return shell(<p role="alert" className="text-danger">{t("address.report.notFound")}</p>);

  if (lookupQuery.isPending) {
    return shell(<div className="space-y-4">
      <LoadingStatus>{t("address.report.loading")}</LoadingStatus>
      <Skeleton className="h-10 w-2/3" /><Skeleton className="h-32 w-full rounded-2xl" /><Skeleton className="h-40 w-full rounded-2xl" />
    </div>);
  }

  if (lookupQuery.isError || !report || !lookupQuery.data) {
    const limited = lookupQuery.error instanceof ApiError && lookupQuery.error.status === 429;
    return shell(<div role="alert" className="text-danger">
      <p>{limited ? t("address.report.limit") : t("address.report.error")}</p>
      {!limited && <button type="button" disabled={lookupQuery.isFetching} onClick={() => { void lookupQuery.refetch(); }} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded font-semibold underline disabled:opacity-50">
        {lookupQuery.isFetching && <Spinner />}{t("common.retry")}
      </button>}
    </div>);
  }

  const addressSource = report.sources.find(source => source.key === "address");
  if (addressSource?.mode !== "live") {
    return shell(<div className="space-y-4">
      <p role="alert" className="text-danger">{t("address.report.notFound")}</p>
      <RegisterSourcesPanel sources={report.sources} isLoading={false} isError={false} onRetry={() => { void lookupQuery.refetch(); }} />
    </div>);
  }

  const { bbrData, publicValuation, zone, spar } = report;
  const retry = () => { void lookupQuery.refetch(); };
  const hasRegisterRecords = zone !== null || publicValuation?.assessedPropertyValueDkk != null || publicValuation?.assessedLandValueDkk != null;

  return shell(<>
    <header>
      <h1 className="ds-display text-2xl leading-tight text-ink sm:text-[34px]">{title}</h1>
      {report.postalCode && <p className="mt-2 text-sm text-ink-soft">{report.postalCode}</p>}
      <p className="mt-4 rounded-xl bg-surface-alt px-4 py-3 text-sm leading-6 text-ink-soft">{t("address.report.notListing")}</p>
    </header>

    <SalesHistoryCard history={report.priceHistory} available={report.salesAvailable} match={report.priceHistoryMatch} />

    <BbrFactsPanel bbrData={bbrData} plotSqm={null} source={bbrData ? "register" : null} matrikelnr={report.matrikelnr} ejerlav={report.ejerlav} bfeNummer={report.bfeNummer}
      loading={lookupQuery.isFetching} failed={false} onRetry={() => { void lookupQuery.refetch(); }} />

    <section className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
      <h3 className="text-[15px] font-extrabold text-ink">{t("address.report.publicRecords")}</h3>
      {hasRegisterRecords ? <dl className="mt-3 grid grid-cols-2 gap-5 sm:grid-cols-3">
        {zone && <Stat label={t("detail.zone")} value={t(`zone.${zone}` as TranslationKey)} />}
        {publicValuation?.assessedPropertyValueDkk != null && <Stat label={t("detail.publicValuation")} value={`${formatDkk(publicValuation.assessedPropertyValueDkk)}${publicValuation.valuationYear ? ` (${publicValuation.valuationYear})` : ""}`} />}
        {publicValuation?.assessedLandValueDkk != null && <Stat label={t("detail.landValue")} value={formatDkk(publicValuation.assessedLandValueDkk)} />}
      </dl> : <p className="mt-2 text-[12.5px] text-ink-soft">{t("address.report.valuationMissing")}</p>}
    </section>

    <ComparablesPanel soldPriceHistory={[]} showHistory={false}
      nearbySales={report.nearbySales} comparables={[]} neighborhoodAvgPricePerSqm={null} />

    <ZipPriceIndexCard postalCode={report.postalCode} areaSqm={bbrData?.areaSqm} areaSource="register" />

    {spar !== undefined && <>
      <SmartEstimateView result={spar ?? undefined} loading={false} failed={spar === null} onRetry={retry} />
      <div id="spar" className="section-anchor"><SparContent result={spar ?? undefined} loading={false} failed={spar === null} onRetry={retry} /></div>
    </>}

    {report.mapUrl && <a href={report.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border-strong px-5 text-sm font-semibold text-ink hover:bg-surface-hover">
      {t("address.report.openMap")} <span aria-hidden="true">↗</span>
    </a>}

    <DueDiligenceChecklist riskFlags={report.riskFlags} />
    <RegisterSourcesPanel sources={report.sources} isLoading={lookupQuery.isFetching} isError={false} onRetry={() => { void lookupQuery.refetch(); }} />
    <p className="text-xs leading-5 text-ink-faint">{t("address.report.listingOnly")}</p>
  </>);
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-ink-soft">{label}</dt><dd className="mt-1.5 break-words text-base font-medium text-ink">{value}</dd></div>;
}

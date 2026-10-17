import { useEffect, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import type { Property } from "@shared/types/index";
import { formatDkk } from "@shared/utils/price";
import { getImageUrl, getPhotos } from "@shared/utils/image";
import { getProperty, getSparEstimate } from "@/lib/api";
import { compareValues, parseCompareIds, type CompareValues } from "@/lib/compare";
import { formatSignedPercent } from "@/lib/smart-estimate";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import { BrandMark } from "@/components/brand-mark";
import { Skeleton } from "@/components/ui/loading";

const dash = "—";

export function ComparePage() {
  const { t, language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ids = parseCompareIds(params.get("ids"));
  const properties = useQueries({ queries: (ids ?? []).map(id => ({ queryKey: ["property", id], queryFn: () => getProperty(id) })) });
  const estimates = useQueries({ queries: (ids ?? []).map(id => ({ queryKey: ["spar", "compare", id], queryFn: () => getSparEstimate(id), staleTime: 30 * 60 * 1000, retry: false })) });

  useEffect(() => {
    const title = tx("Sammenlign boliger", "Compare homes");
    document.title = `${title} | ${t("app.name")}`;
    return () => { document.title = t("app.name"); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const back = () => { if (window.history.state?.idx > 0) navigate(-1); else navigate("/dashboard"); };
  const header = <div className="mb-6 flex items-center gap-3">
    <button type="button" onClick={back} aria-label={t("detail.back")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-ink transition hover:bg-surface-hover">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
    </button>
    <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{tx("Detaljeret sammenligning", "Detailed comparison")}</h1>
  </div>;

  if (!ids) return <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">{header}
    <div role="status" className="rounded-2xl border border-dashed border-border-strong bg-surface p-8 text-center">
      <p className="font-semibold">{tx("Vælg mindst to boliger at sammenligne", "Choose at least two homes to compare")}</p>
      <p className="mt-2 text-sm text-ink-soft">{tx("Gå til dine gemte boliger, tryk Sammenlign og vælg to eller tre.", "Go to your saved homes, tap Compare and choose two or three.")}</p>
      <Link to="/dashboard" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-cta px-5 text-sm font-semibold text-cta-text">{tx("Til gemte boliger", "To saved homes")}</Link>
    </div></div>;

  const columns = ids.map((id, index) => {
    const property = properties[index]?.data?.property;
    const estimate = estimates[index]?.data;
    return { id, property, loading: properties[index]?.isPending ?? true, failed: properties[index]?.isError ?? false, values: property ? compareValues(property, estimate) : null, estimateLoading: estimates[index]?.isPending ?? true };
  });
  const cols = columns.length === 3 ? "grid-cols-3" : "grid-cols-2";

  function section(label: string, cell: (values: CompareValues, loadingEstimate: boolean) => ReactNode) {
    return <section key={label} aria-label={label}>
      <h2 className="rounded-lg bg-surface-alt px-3 py-2.5 text-center text-sm font-semibold">{label}</h2>
      <div className={`mt-3 grid ${cols} gap-3 px-1 text-center text-sm text-ink-soft`}>
        {columns.map(column => <div key={column.id} className="min-w-0 break-words">{column.loading ? <Skeleton className="mx-auto h-4 w-16" /> : column.values ? cell(column.values, column.estimateLoading) : dash}</div>)}
      </div>
    </section>;
  }
  const dkk = (value: number | null) => value === null ? dash : formatDkk(Math.round(value));

  return <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
    {header}
    <div className={`grid ${cols} gap-3`}>
      {columns.map(column => <div key={column.id} className="min-w-0">
        <CompareHead id={column.id} property={column.property} loading={column.loading} failed={column.failed} />
      </div>)}
    </div>
    <div className="mt-6 grid gap-5">
      {section(tx("Pris pr. m²", "Price per m²"), v => dkk(v.pricePerSqm))}
      {section(tx("Byggeår", "Year built"), v => v.buildingYear ?? dash)}
      {section(tx("Energimærke", "Energy label"), v => v.energyLabel ?? dash)}
      {section(tx("Boligtype", "Property type"), v => t(`propertyType.${v.propertyType}` as TranslationKey))}
      {section(tx("Tid på markedet", "Time on market"), v => v.daysOnMarket === null ? dash : tx(`${v.daysOnMarket} dage`, `${v.daysOnMarket} days`))}
      {section(tx("Offentlig vurdering", "Public valuation"), (v, pending) => v.valuation ? <>{dkk(v.valuation.valueDkk)}<span className="block text-xs">{v.valuation.year}</span></> : pending ? dash : tx("Ikke tilgængelig", "Not available"))}
      {section(tx("Estimeret fair pris", "Estimated fair price"), (v, pending) => v.fair ? <>{dkk(v.fair.estimate)}<span className="block text-xs">{dkk(v.fair.lo80)} – {dkk(v.fair.hi80)}</span></> : pending ? dash : tx("Ikke tilgængelig", "Not available"))}
      {section(tx("Udbudspris mod estimat", "Asking price vs estimate"), v => v.askingVsFair === null ? dash : formatSignedPercent(v.askingVsFair, language))}
      {section(tx("Kilde", "Source"), v => v.listingSource)}
    </div>
    <p className="mt-8 text-xs leading-5 text-ink-soft">{tx("Estimater bygger på offentlig vurdering og vores eget SPAR-niveau. De er ikke vurderinger og siger intet om stand eller beliggenhed.", "Estimates rest on the public valuation and our own SPAR level. They are not appraisals and say nothing about condition or location.")}</p>
  </div>;
}

function CompareHead({ id, property, loading, failed }: { id: string; property?: Property; loading: boolean; failed: boolean }) {
  const { language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  if (loading) return <><Skeleton className="aspect-[4/3] rounded-xl" /><Skeleton className="mt-3 h-4 w-full" /><Skeleton className="mt-2 h-4 w-2/3" /></>;
  if (failed || !property) return <div role="alert" className="rounded-xl border border-border p-3 text-center text-xs text-ink-soft">{tx("Boligen kunne ikke hentes", "This home could not be loaded")}<br /><Link to={`/property/${id}`} className="font-semibold underline">{tx("Åbn", "Open")}</Link></div>;
  const photo = getPhotos(property.images)[0];
  return <Link to={`/property/${property.id}`} className="group block text-center">
    <div className="aspect-[4/3] overflow-hidden rounded-xl bg-surface-alt">
      {photo ? <img src={getImageUrl(photo, 400, 300)} alt="" loading="lazy" className="h-full w-full object-cover" />
        : <span className="flex h-full w-full items-center justify-center text-ink-faint"><BrandMark className="h-8 w-8 opacity-40" /></span>}
    </div>
    <p className="mt-3 break-words text-[13px] font-medium leading-5 group-hover:text-brand-text">{property.address}</p>
    <p className="mt-2 text-base font-semibold tracking-tight">{formatDkk(property.price)}</p>
    <p className="mt-1 text-xs text-ink-soft">{property.sqm} m²{property.rooms ? ` · ${property.rooms} ${tx("rum", "rooms")}` : ""}</p>
  </Link>;
}

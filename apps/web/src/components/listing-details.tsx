import { useState } from "react";
import type { ListingDetails, Property } from "@shared/types/index";
import { formatDkk } from "@shared/utils/price";
import { useI18n } from "@/i18n/i18n";

export function PropertyDescription({ property, details }: { property: Property; details: ListingDetails | null }) {
  const { language } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const description = details?.description ?? property.description;
  const title = details?.title;
  const sourceUrl = details?.sourceUrl ?? property.listingUrl;
  if (!description && !title) return null;

  return <section className="rounded-2xl bg-surface-alt p-5 sm:p-7">
    <h2 className="text-xl font-medium tracking-tight">{tx("Om boligen", "About this home")}</h2>
    {details?.description && <p className="mt-3 text-xs font-medium text-ink-soft">{tx("Mægler skriver", "The agent writes")} · Boligsiden</p>}
    {title && <h3 className="mt-3 text-base font-semibold">{title}</h3>}
    {description && description !== title && <p className={`mt-4 whitespace-pre-line text-sm leading-7 text-ink-soft ${!expanded && description.length > 500 ? "line-clamp-4" : ""}`}>{description}</p>}
    {description && description.length > 500 && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="mt-3 rounded text-sm font-semibold underline underline-offset-4">
      {expanded ? tx("Vis mindre", "Show less") : tx("Læs mere", "Read more")}
    </button>}
    {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-4 block w-fit rounded text-sm font-semibold underline underline-offset-4">
      {tx("Læs hele annoncen hos", "Read the full listing on")} {property.listingSource === "boligsiden" ? "Boligsiden" : "Boliga"} ↗
    </a>}
  </section>;
}

/** Listing values stay in their own source-labelled group, never in BBR data. */
export function ListingFactsPanel({ property, details }: { property: Property; details: ListingDetails | null }) {
  const { t, language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const facts = details?.facts;
  const number = (value: number | null | undefined) => value == null ? null : String(value);
  const area = (value: number | null | undefined) => value == null ? null : t("property.sqm", { sqm: value });
  const valuation = facts?.publicValuation;
  const sourceName = property.listingSource === "boligsiden" ? "Boligsiden" : "Boliga";
  const sourceUrl = details?.sourceUrl ?? property.listingUrl;
  const rows = [
    { label: t("detail.size"), value: area(facts?.areaSqm ?? property.sqm) },
    { label: t("detail.rooms"), value: number(property.rooms) },
    { label: t("detail.built"), value: number(facts?.yearBuilt ?? (property.dataMode === "real" ? property.buildingYear : null)) },
    { label: t("detail.renovated"), value: number(facts?.renovationYear) },
    { label: t("detail.energyLabel"), value: facts?.energyLabel },
    { label: t("bbrFacts.floors"), value: number(facts?.floors) },
    { label: t("bbrFacts.heating"), value: facts?.heatingInstallation },
    { label: t("detail.wallMaterial"), value: facts?.wallMaterial },
    { label: t("detail.roofMaterial"), value: facts?.roofMaterial },
    { label: t("detail.parcelArea"), value: area(facts?.landAreaSqm) },
    { label: t("bbrFacts.basementSqm"), value: area(facts?.basementSqm) },
    { label: t("bbrFacts.toiletCount"), value: number(facts?.toiletCount) },
    { label: t("bbrFacts.bathroomCount"), value: number(facts?.bathroomCount) },
    { label: t("detail.publicValuation"), value: valuation?.assessedPropertyValueDkk != null ? `${formatDkk(valuation.assessedPropertyValueDkk)}${valuation.valuationYear ? ` (${valuation.valuationYear})` : ""}` : null },
    { label: t("detail.landValue"), value: valuation?.assessedLandValueDkk != null ? formatDkk(valuation.assessedLandValueDkk) : null },
  ].filter((row): row is { label: string; value: string } => row.value != null);

  return <section className="mb-5">
    <h3 className="text-[15px] font-semibold">{tx("Oplysninger fra annoncen", "Listing details")}</h3>
    <p className="mt-1 text-xs text-ink-soft">{tx("Kilde", "Source")}: {sourceUrl
      ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="rounded underline underline-offset-4">{sourceName} ↗</a>
      : sourceName}</p>
    <dl className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-3">
      {rows.map(row => <div key={row.label}>
        <dt className="text-xs text-ink-soft">{row.label}</dt>
        <dd className="mt-1 text-sm font-medium">{row.value}</dd>
      </div>)}
    </dl>
  </section>;
}

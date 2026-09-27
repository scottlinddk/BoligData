import type { ReactNode } from "react";
import type { Property } from "@shared/types/index";
import type { ResearchHistoryResponse } from "@shared/types/research-api";
import type { MergedPropertyFacts } from "@/lib/property-facts";
import type { ResearchListingTimeResult } from "@/lib/research-listing-time";
import { listingEvidence, reportedListingDuration } from "@/lib/listing-evidence";
import { Money, useResearchText } from "./fields";

export function ListingEvidenceOverview({ property, listing, facts, history }: { property: Property; listing: ResearchListingTimeResult; facts?: MergedPropertyFacts; history?: ResearchHistoryResponse }) {
  const tx = useResearchText();
  const evidence = listingEvidence(property, listing, facts);
  const reportedTime = evidence.documentedDays ? null : reportedListingDuration(property, history);
  const days = reportedTime?.days ?? evidence.days;
  const sales = (facts?.nearbySales ?? []).slice(0, 3);
  const saleType = (type: string | undefined) => type === "normal" ? tx("Fri handel", "Market sale") : type === "family" ? tx("Familiehandel", "Family transfer") : type === "auction" ? tx("Auktion", "Auction") : tx("Anden / ukendt handelstype", "Other / unknown transfer type");
  return <section data-testid="listing-evidence-overview" className="rounded-2xl border border-border bg-surface p-5 shadow-card" aria-label={tx("Boligens oplysninger", "Listing evidence")}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{tx("Det ved vi om boligen", "What we know about this home")}</h2><p className="mt-1 text-xs text-ink-soft">{property.address} · {property.listingSource} · {tx("opdateret", "updated")} {property.updatedAt.slice(0, 10)}</p></div>{property.listingUrl && <a href={property.listingUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-text underline underline-offset-2">{tx("Se annoncen", "View source listing")} ↗</a>}</div>
    <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      {evidence.asking !== null && <Metric label={tx("Udbudspris", "Asking price")}><Money value={evidence.asking} /></Metric>}
      {evidence.area !== null && <Metric label={tx("Annonceret boligareal", "Advertised living area")}>{evidence.area} m²{evidence.rooms !== null && <span className="mt-1 block text-xs font-normal text-ink-soft">{evidence.rooms} {tx("annoncerede rum", "advertised rooms")}</span>}</Metric>}
      {evidence.pricePerSqm !== null && <Metric label={tx("Pris pr. annonce-m²", "Asking per advertised m²")}><Money value={evidence.pricePerSqm} /></Metric>}
      {days !== null && <Metric label={reportedTime ? tx("Liggetid oplyst af kilden", "Source-reported listing time") : evidence.documentedDays ? tx("Aktuelt udbudsforløb", "Current listing period") : tx("Siden oplyst annoncedato", "Since reported listing date")}>{days} {tx("dage", "days")}</Metric>}
    </dl>
    {reportedTime && <p className="mt-3 text-xs text-ink-soft">{tx("Annoncekildens oplysning pr.", "Reported by the listing source on")} {reportedTime.observedAt.slice(0, 10)}. {tx("Vises separat fra de dokumenterede perioder, som prisreferencen kræver.", "Shown separately from the documented periods required by the price reference.")}</p>}
    {!reportedTime && !evidence.documentedDays && evidence.days !== null && <p className="mt-3 text-xs text-ink-soft">{tx("Tiden er beregnet fra annoncens oplyste dato. Pauser og genudbud er ikke afklaret; den bruges ikke som dokumenteret liggetid i prisreferencen.", "Elapsed time uses the reported listing date. Pauses and relistings are unresolved; this is not treated as documented time in the price reference.")}</p>}
    {evidence.synthetic ? <p className="mt-3 text-sm text-warning-text">{tx("Demooplysninger. De indgår ikke i en markedsvurdering.", "Demo listing. These figures are excluded from market valuation.")}</p> : property.dataMode !== "real" && <p className="mt-3 text-xs text-ink-soft">{tx("Annonceoplysningerne er endnu ikke genbekræftet hos kilden.", "The advertised details have not yet been reconfirmed with their source.")}</p>}
    {(evidence.lastSale || evidence.priceChange !== null || evidence.registerArea !== null) && <ul className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
      {evidence.lastSale && <li><span className="text-ink-soft">{tx("Seneste registrerede handel", "Latest registered sale")}: </span><strong><Money value={evidence.lastSale.price} /></strong> · {evidence.lastSale.soldDate} · {saleType(evidence.lastSale.saleType)}<span className="mt-1 block text-xs text-ink-soft">Boligsiden · {tx("Historisk handel, ikke en vurdering af prisen i dag.", "Historical transaction, not a current valuation.")}</span></li>}
      {evidence.priceChange !== null && <li>{tx("Udbuddet er ændret", "Asking price has changed")} <strong>{evidence.priceChange > 0 ? "+" : evidence.priceChange < 0 ? "−" : ""}<Money value={Math.abs(evidence.priceChange)} /></strong> {tx("siden det dokumenterede første udbud på", "since the documented initial asking price of")} <Money value={evidence.firstAsking} />.</li>}
      {evidence.registerArea !== null && <li className="rounded-xl bg-warning-soft p-3 text-warning-text">{evidence.area === null ? <>{tx("Registreret boligareal", "Registered living area")}: {evidence.registerArea} m² (BBR)</> : <>{tx("Arealerne afviger", "Area mismatch")}: {evidence.area} m² {tx("i annoncen mod", "advertised versus")} {evidence.registerArea} m² {tx("i BBR. Afklar forskellen før sammenligning af m²-priser.", "in BBR. Clarify the difference before comparing prices per m².")}</>}</li>}
    </ul>}
    {sales.length > 0 && <div className="mt-4 border-t border-border pt-4"><h3 className="font-semibold">{tx("Registrerede handler tæt på boligen", "Registered sales near this home")}</h3><p className="mt-1 text-xs text-ink-soft">Boligsiden · {tx("Geografiske naboer; boligtype, størrelse og stand kan være anderledes.", "Nearby addresses; type, size and condition may differ.")}</p><ul className="mt-3 grid gap-2 sm:grid-cols-3">{sales.map(sale => <li key={`${sale.address}-${sale.soldDate}-${sale.price}`} className="rounded-xl bg-surface-alt p-3 text-sm"><p className="font-semibold">{sale.address}</p><p className="mt-1 font-bold"><Money value={sale.price} /></p><p className="mt-1 text-xs text-ink-soft">{sale.soldDate} · {sale.distanceMeters} m</p><p className="mt-1 text-xs text-ink-soft">{saleType(sale.saleType)}</p></li>)}</ul></div>}
  </section>;
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return <div className="rounded-xl bg-surface-alt p-3"><dt className="text-xs text-ink-soft">{label}</dt><dd className="mt-2 text-lg font-bold tracking-tight">{children}</dd></div>;
}

import { WORKBOOK_PRICE_REFERENCE_MODEL } from "@shared/analysis";
import type { Property } from "@shared/types/index";
import type { ResearchHistoryResponse } from "@shared/types/research-api";
import { useI18n } from "@/i18n/i18n";
import { workbookListingReference } from "@/lib/workbook-listing-reference";
import { buttonClass, Money, useResearchText } from "./fields";

interface Props {
  property: Property;
  history?: ResearchHistoryResponse;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}

/** The historical sample is visible without requiring any local comparable sales. */
export function WorkbookPriceReferenceCard({ property, history, loading, failed, onRetry }: Props) {
  const tx = useResearchText();
  const { language } = useI18n();
  const { listing, reference, firstAsking, estimatedFirst, lastSourceCheck, stale, invalidSourceTiming } = workbookListingReference(property, history);
  const { metadata, bracket } = reference;
  const eligibleListing = property.dataMode === "real" && property.status === "active";
  const usableHistory = eligibleListing && !loading && !failed && !history?.truncated && !invalidSourceTiming;
  const ready = usableHistory && reference.status === "available";
  const historicalBracket = usableHistory && reference.status === "missing_first_asking" ? bracket : null;
  const broadScenario = reference.applicability === "broad_scenario";
  const percent = (value: number) => new Intl.NumberFormat(language === "da" ? "da-DK" : "en-GB", { maximumFractionDigits: 1 }).format(value) + " %";
  const reason = !eligibleListing
    ? tx("En beregnet pris kræver en aktiv annonce med oplysninger bekræftet hos kilden. Det historiske grundlag kan stadig ses nedenfor.", "A calculated price requires an active listing with source-confirmed data. The historical sample is still available below.")
    : failed
      ? tx("Udbudshistorikken kunne ikke hentes. Prøv igen for at kontrollere første udbudspris og liggetid.", "Listing history could not be loaded. Retry to check the first asking price and time on market.")
      : loading
        ? tx("Henter første udbudspris og liggetid…", "Loading first asking price and time on market…")
        : history?.truncated
          ? tx("Udbudshistorikken er ufuldstændig. Første pris kan ikke fastslås sikkert, så der vises ingen beregnet pris.", "Listing history is incomplete. The first asking price cannot be established reliably, so no price is calculated.")
          : invalidSourceTiming
            ? tx("Kildehistorikken indeholder ugyldige eller fremtidige observationstidspunkter. De skal afklares, før der kan beregnes en pris.", "The source history contains invalid or future observation timestamps. They must be resolved before a price can be calculated.")
            : reference.status === "missing_first_asking"
              ? tx("Første udbudspris mangler. Det historiske prisfald vises, men omregnes først til kroner, når en dokumenteret første pris eller en pålidelig prisændring fra kilden er tilgængelig.", "The first asking price is missing. Historical reductions are shown, but a price in kroner needs a documented first price or a reliable source price-change percentage.")
              : reference.status === "missing_days"
                ? tx("Dokumenteret liggetid for den aktuelle annonce mangler eller er modstridende. Se alle historiske tidsgrupper nedenfor.", "The current listing's documented time on market is missing or conflicting. All historical time groups are available below.")
                : reference.status === "outside_observed_range"
                  ? tx(`Liggetiden ligger uden for grundlagets ${metadata.observedMinDays}–${metadata.observedMaxDays} observerede dage. Se de historiske grupper nedenfor.`, `Time on market is outside the sample's observed ${metadata.observedMinDays}–${metadata.observedMaxDays} days. See the historical groups below.`)
                  : reference.status === "insufficient_sample"
                    ? tx("Den historiske tidsgruppe mangler tilstrækkelige observationer. Se de øvrige grupper nedenfor.", "The historical time group lacks sufficient observations. See the other groups below.")
                    : reference.status === "invalid_model"
                      ? tx("Excel-grundlaget kunne ikke valideres. Der vises ingen pris, før datagrundlaget er rettet.", "The workbook model could not be validated. No price is shown until the dataset is corrected.")
                      : null;
  const gap = reference.gapAmount;

  return <section aria-labelledby="workbook-price-title" aria-busy={loading} data-testid="workbook-price-reference" data-state={ready ? "available" : failed ? "error" : loading ? "loading" : reference.status} className="overflow-hidden rounded-2xl border border-border bg-surface-alt">
    <div className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="workbook-price-title" className="text-xl font-semibold tracking-tight text-ink">{tx("Pris efter liggetid", "Price by time on market")}</h2>
        <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink-soft">{tx("Historisk scenario", "Historical scenario")}</span>
      </div>
      {ready ? <>
        <div className="mt-5 grid gap-5 sm:grid-cols-[1.2fr_1fr]">
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink-soft">{broadScenario ? tx("Bredt historisk scenario", "Broad historical scenario") : estimatedFirst ? tx("Omtrentlig prisreference", "Approximate price reference") : tx("Beregnet prisreference", "Calculated price reference")}</p>
            <p data-testid="workbook-target-price" className="mt-1 break-words text-3xl font-semibold tracking-tight text-ink sm:text-4xl"><Money value={reference.referencePrice} /></p>
            <p className="mt-2 text-xs text-ink-soft">{tx("Historisk spænd", "Historical spread")}: <Money value={reference.lowerPrice} /> – <Money value={reference.upperPrice} /></p>
          </div>
          <div className="min-w-0 rounded-xl bg-surface p-4">
            <p className="text-xs text-ink-soft">{tx("Dagens udbudspris", "Current asking price")}</p>
            <p className="mt-1 text-xl font-semibold"><Money value={property.price} /></p>
            {gap !== null && <p data-testid="workbook-price-gap" className="mt-2 text-xs text-ink-soft">
              {gap === 0 ? tx("På niveau med prisreferencen", "In line with the price reference") : <>
                <strong className="font-medium text-ink"><Money value={Math.abs(gap)} /></strong>{reference.gapPercent !== null && <> ({percent(Math.abs(reference.gapPercent))})</>} {gap > 0 ? tx("over prisreferencen", "above the price reference") : tx("under prisreferencen", "below the price reference")}
              </>}
            </p>}
          </div>
        </div>
        <p className="mt-4 text-xs text-ink-soft">{listing.time.latestEpisodeDays} {tx("dage på markedet", "days on market")} · {bracket!.count} {tx("historiske handler i tidsgruppen", "historical sales in this time group")} · {percent(reference.medianDiscountPercent!)} {tx("medianfald", "median reduction")}</p>
        {estimatedFirst && <p className="mt-3 text-xs text-ink-soft">{tx("Omtrentligt scenario: første udbud er beregnet fra kildens afrundede prisændring.", "Approximate scenario: first asking is estimated from the source's rounded price change.")}</p>}
      </> : <div role="status" className="mt-4">
        {historicalBracket ? <div data-testid="workbook-historical-discount">
          <p className="text-3xl font-semibold tracking-tight">{percent(historicalBracket.medianDiscountFraction * 100)}</p>
          <p className="mt-1 text-sm text-ink-soft">{tx("Historisk medianfald fra første udbud", "Historical median reduction from first asking")} · {historicalBracket.label} {tx("dage", "days")} · {historicalBracket.count} {tx("handler", "sales")}</p>
        </div> : <p className="font-semibold">{loading && !failed ? tx("Henter prisgrundlag…", "Loading price evidence…") : tx("Historiske data er tilgængelige", "Historical data is available")}</p>}
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{reason}</p>
        {failed && <button type="button" className={`${buttonClass} mt-3`} onClick={onRetry}>{tx("Prøv igen", "Retry")}</button>}
      </div>}
      {broadScenario && (ready || historicalBracket) && <p data-testid="workbook-broad-scenario" className="mt-3 rounded-xl bg-warning-soft p-3 text-sm text-warning-text">{tx("Boligen er uden for udvalgets boligtype eller område. Scenariet anvender historiske villasalg i Aalborg/Hasseris og er ikke baseret på lokale, sammenlignelige handler for denne bolig.", "This home is outside the sample's property type or area. The scenario uses historical villa sales in Aalborg/Hasseris, not locally matched comparable sales for this home.")}</p>}
      <p className="mt-3 text-xs text-ink-soft">{tx("Et historisk pejlemærke, ikke en markedsvurdering. Kræver ikke fem sammenlignelige salg.", "A historical reference, not a market valuation. Five comparable sales are not required.")}</p>
      {stale && <p className="mt-3 text-xs text-warning-text">{tx("Kilden er ikke blevet bekræftet i over en uge. Pris og liggetid kan have ændret sig.", "The source has not been confirmed for over a week. Price and listing time may have changed.")}</p>}

      <details className="mt-4 border-t border-border pt-3 text-xs text-ink-soft">
        <summary className="w-fit cursor-pointer rounded font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">{tx("Datagrundlag og beregning", "Evidence and calculation")}</summary>
        <p className="mt-3 leading-relaxed">{tx(`Grundlaget er ${metadata.eligibleCount} historiske villasalg i et udvalgt kortområde i Aalborg/Hasseris. Referencen tager ikke højde for boligens stand, størrelse eller præcise beliggenhed og er ikke en markedsvurdering.`, `The basis is ${metadata.eligibleCount} historical villa sales in a selected Aalborg/Hasseris map area. This reference does not account for condition, size or exact location and is not a market valuation.`)}</p>
        {firstAsking !== null && <p className="mt-3">{estimatedFirst ? tx("Beregnet første udbud", "Estimated first asking price") : tx("Dokumenteret første udbud", "Documented first asking price")}: <strong className="text-ink"><Money value={estimatedFirst ? Math.round(firstAsking / metadata.roundingDkk) * metadata.roundingDkk : firstAsking} /></strong></p>}
        {estimatedFirst && <p className="mt-2">{tx("Første udbud er beregnet fra Boligsidens afrundede prisændring", "The first asking price is estimated from Boligsiden's rounded price change")} ({percent(estimatedFirst.changePercent)}, {estimatedFirst.observedAt.slice(0, 10)}). {tx("Referencen er derfor et omtrentligt scenario, ikke en dokumenteret historisk udbudspris.", "The reference is therefore an approximate scenario, not a documented historical asking price.")}</p>}
        {listing.latestEpisodeSource && <p className="mt-2">{tx("Liggetiden er kildens oplyste dagetal pr.", "Time on market is the source's reported count as of")} {listing.latestEpisodeSource.observedAt.slice(0, 10)}. {tx("Tallet fremskrives ikke mellem kildeopdateringer.", "The count is not advanced between source updates.")}</p>}
        <p className="mt-3 leading-relaxed">{tx("Første udbudspris × (1 − median samlet prisfald i tidsgruppen). Dokumenteret første pris foretrækkes; en beregnet første pris markeres tydeligt. Et samlet historisk prisfald trækkes aldrig som ekstra rabat fra dagens udbudspris. Afstanden i procent måles i forhold til dagens udbud.", "First asking price × (1 − the time group's median total price reduction). A documented first price takes priority; an estimated first price is clearly labelled. Historical total reductions are never applied as an additional discount to today's asking price. The percentage gap is measured against today's asking price.")}</p>
        <p className="mt-2">{tx(`Beløb afrundes til ${metadata.roundingDkk.toLocaleString("da-DK")} kr. Tidsgrupper samles til mindst ${metadata.minimumSample} handler. Intervallet viser de midterste 50 % af de historiske udfald, ikke et sikkert prisinterval for boligen.`, `Amounts are rounded to DKK ${metadata.roundingDkk.toLocaleString("en-GB")}. Time groups are pooled to at least ${metadata.minimumSample} sales. The range shows the middle 50% of historical outcomes, not a guaranteed price range for this home.`)}</p>
        <div className="mt-4 overflow-x-auto"><table data-testid="workbook-historical-groups" className="w-full text-left">
          <caption className="mb-2 text-left font-medium text-ink">{tx("Alle historiske tidsgrupper", "All historical time groups")}</caption>
          <thead><tr className="border-b border-border"><th className="py-2 pr-3 font-medium">{tx("Liggetid", "Time on market")}</th><th className="py-2 pr-3 font-medium">{tx("Handler", "Sales")}</th><th className="py-2 pr-3 font-medium">{tx("Medianfald", "Median reduction")}</th><th className="py-2 font-medium">{tx("Midterste 50 %", "Middle 50%")}</th></tr></thead>
          <tbody>{WORKBOOK_PRICE_REFERENCE_MODEL.brackets.map(group => <tr key={group.label} className={`border-b border-border/60 ${bracket?.label === group.label ? "font-medium text-ink" : ""}`}><td className="py-2 pr-3">{group.label} {tx("dage", "days")}</td><td className="py-2 pr-3">{group.count}</td><td className="py-2 pr-3">{percent(group.medianDiscountFraction * 100)}</td><td className="whitespace-nowrap py-2">{percent(group.q1DiscountFraction * 100)} – {percent(group.q3DiscountFraction * 100)}</td></tr>)}</tbody>
        </table></div>
        <p className="mt-3">{tx("Excel-grundlag", "Workbook snapshot")}: <time dateTime={metadata.snapshotDate}>{metadata.snapshotDate}</time> · {tx("Observeret liggetid", "Observed time on market")}: {metadata.observedMinDays}–{metadata.observedMaxDays} {tx("dage", "days")}</p>
        <p className="mt-2">{tx("Seneste kildekontrol", "Last source check")}: {lastSourceCheck ? <time dateTime={lastSourceCheck}>{lastSourceCheck.slice(0, 10)}</time> : tx("Ukendt", "Unknown")} · {property.listingSource === "boligsiden" ? "Boligsiden" : "Boliga"}</p>
        <p className="mt-2 break-words">{tx("Kildefil", "Source workbook")}: {metadata.sourceFilename}</p>
        <p className="mt-2">{tx("Ugentlig kildekontrol opdaterer annoncerne. Excel-udvalget beholder sin viste dato, indtil et nyt dokumenteret datagrundlag importeres.", "Weekly source checks refresh listings. The workbook sample retains its displayed date until a new documented dataset is imported.")}</p>
      </details>
    </div>
  </section>;
}

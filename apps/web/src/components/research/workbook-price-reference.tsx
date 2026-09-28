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

/** Keep historical evidence visible; a monetary reference requires the original
 * asking price so previous reductions are never applied a second time. */
export function WorkbookPriceReferenceCard({ property, history, loading, failed, onRetry }: Props) {
  const tx = useResearchText();
  const { language } = useI18n();
  const { listing, reference, firstAsking, estimatedFirst, exactOriginal, originalPriceConflict, lastSourceCheck, stale, invalidSourceTiming } = workbookListingReference(property, history);
  const { metadata, bracket } = reference;
  const ready = reference.status === "available";
  const historicalDataAvailable = bracket !== null && reference.medianDiscountPercent !== null;
  const allSales = reference.timeBasis === "all_sales";
  const nearestBracket = reference.timeBasis === "nearest_bracket";
  const broadScenario = reference.applicability === "broad_scenario";
  const currentAsking = Number.isFinite(property.price) && property.price > 0 ? property.price : null;
  const percent = (value: number) => new Intl.NumberFormat(language === "da" ? "da-DK" : "en-GB", { maximumFractionDigits: 1 }).format(value) + " %";
  const gap = reference.gapAmount;
  const historyStatus = failed
    ? tx("Udbudshistorikken kunne ikke hentes.", "Listing history could not be loaded.")
    : loading
      ? tx("Opdaterer udbudshistorik.", "Updating listing history.")
      : invalidSourceTiming
        ? tx("Historikken indeholder ugyldige eller fremtidige observationer. De er udeladt fra beregningen.", "History contains invalid or future observations. They are excluded from the calculation.")
        : history?.truncated
          ? exactOriginal
            ? tx("Den øvrige udbudshistorik er afkortet. Den oprindelige pris er hentet som særskilt kildeoplysning.", "The remaining listing history is truncated. The original price was retrieved as separate source evidence.")
            : tx("Udbudshistorikken er ufuldstændig. Den oprindelige udbudspris kan ikke fastslås fra dette udsnit.", "Listing history is incomplete. The original asking price cannot be established from this excerpt.")
          : null;

  return <section aria-labelledby="workbook-price-title" aria-busy={loading} data-testid="workbook-price-reference" data-state={ready ? "available" : reference.status} className="overflow-hidden rounded-2xl border border-border bg-surface-alt">
    <div className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="workbook-price-title" className="text-xl font-semibold tracking-tight text-ink">{tx("Pris efter liggetid", "Price by time on market")}</h2>
        <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink-soft">{tx("Historisk scenario", "Historical scenario")}</span>
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-border bg-surface p-4 sm:p-5">
          <dt className="text-sm font-medium text-ink-soft">{tx("Aktuel udbudspris", "Current asking price")}</dt>
          <dd data-testid="workbook-current-asking" className="mt-2 break-words text-3xl font-semibold tracking-tight text-ink"><Money value={currentAsking} /></dd>
        </div>
        <div className="min-w-0 rounded-xl border border-border-strong bg-surface p-4 sm:p-5">
          <dt className="text-sm font-medium text-ink-soft">{tx("Burde koste", "Should cost")}</dt>
          <dd data-testid={ready ? "workbook-target-price" : undefined} className="mt-2 break-words text-3xl font-semibold tracking-tight text-ink">
            <Money value={ready ? reference.referencePrice : null} />
            {!ready && <p className="mt-2 text-xs font-normal tracking-normal text-ink-soft">{reference.status === "missing_first_asking" ? tx("Afventer oprindelig udbudspris", "Awaiting original asking price") : tx("Datagrundlag ikke tilgængeligt", "Historical data unavailable")}</p>}
          </dd>
        </div>
      </dl>
      {ready ? <>
        {gap !== null ? <div data-testid="workbook-price-gap" data-comparison={gap > 0 ? "above" : gap < 0 ? "below" : "equal"} className="mt-3 rounded-xl border border-border-strong p-4">
          <p className="text-sm font-medium text-ink">{gap > 0 ? tx("Udbudsprisen er over ‘Burde koste’", "Asking price is above ‘Should cost’") : gap < 0 ? tx("Udbudsprisen er under ‘Burde koste’", "Asking price is below ‘Should cost’") : tx("Udbudsprisen er på niveau med ‘Burde koste’", "Asking price is in line with ‘Should cost’")}</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-2xl font-semibold tracking-tight text-ink"><Money value={Math.abs(gap)} />{reference.gapPercent !== null && <span className="text-base font-medium text-ink-soft">{percent(Math.abs(reference.gapPercent))} {tx("af udbudsprisen", "of asking price")}</span>}</p>
          <p className="mt-1 text-xs text-ink-soft">{tx("Forskel mellem aktuel udbudspris og det historiske prispejlemærke.", "Difference between the current asking price and the historical price reference.")}</p>
        </div> : <p data-testid="workbook-comparison-unavailable" className="mt-3 text-sm text-ink-soft">{tx("Sammenligningen afventer en gyldig aktuel udbudspris.", "A valid current asking price is needed for the comparison.")}</p>}
        <div className="mt-3">
            {reference.referencePrice === 0 && <p className="mt-2 text-xs text-ink-soft">{tx(`Beløbet afrundes til 0 kr. ved afrunding til nærmeste ${metadata.roundingDkk.toLocaleString("da-DK")} kr.`, `The amount rounds to DKK 0 when rounded to the nearest DKK ${metadata.roundingDkk.toLocaleString("en-GB")}.`)}</p>}
            <p className="mt-2 text-xs text-ink-soft">{tx("Historisk spænd", "Historical spread")}: <Money value={reference.lowerPrice} /> – <Money value={reference.upperPrice} /></p>
            <p data-testid="workbook-original-price-basis" className="mt-2 text-xs text-ink-soft">{estimatedFirst ? tx("Beregnet oprindelig udbudspris", "Estimated original asking price") : tx("Oprindelig udbudspris", "Original asking price")}: <strong className="font-medium text-ink"><Money value={estimatedFirst && reference.baselinePrice !== null ? Math.round(reference.baselinePrice / metadata.roundingDkk) * metadata.roundingDkk : reference.baselinePrice} /></strong></p>
        </div>
        {estimatedFirst && <p className="mt-2 text-xs text-ink-soft">{tx("Omtrentligt scenario: første udbud er beregnet fra kildens afrundede prisændring.", "Approximate scenario: first asking is estimated from the source's rounded price change.")}</p>}
      </> : <div className="mt-3">
        <p role="status" className="mt-2 text-sm text-ink-soft">{reference.status === "missing_first_asking"
          ? tx("Den oprindelige udbudspris mangler. ‘Burde koste’ beregnes, når den kan dokumenteres eller beregnes fra kildens prisændring. Dagens pris bruges kun til sammenligning.", "The original asking price is missing. ‘Should cost’ is calculated once it can be documented or reconstructed from the source's price change. Current asking is used only for comparison.")
          : tx("Det historiske datagrundlag kunne ikke valideres.", "The historical dataset could not be validated.")}</p>
      </div>}
      {originalPriceConflict && <p role="status" className="mt-3 text-sm text-warning-text">{tx("Kilderne angiver forskellige oprindelige udbudspriser. ‘Burde koste’ afventer afklaring af prisgrundlaget.", "The sources report conflicting original asking prices. ‘Should cost’ requires this conflict to be resolved.")}</p>}
      {historicalDataAvailable && <>
        <p data-testid="workbook-time-basis" className="mt-4 text-xs text-ink-soft">
          {allSales ? tx("Liggetid ukendt · samlet historisk grundlag", "Time on market unknown · full historical sample") : <>{reference.latestEpisodeDays} {tx("dage på markedet", "days on market")} · {tx("Tidsgruppe", "Time group")}: {bracket!.label} {tx("dage", "days")}</>}
          {" · "}{bracket!.count} {tx("historiske handler", "historical sales")} · {percent(reference.medianDiscountPercent!)} {tx("medianfald", "median reduction")}
        </p>
        {nearestBracket && <p data-testid="workbook-nearest-bracket" className="mt-2 text-xs text-ink-soft">{tx(`Liggetiden er uden for de observerede ${metadata.observedMinDays}–${metadata.observedMaxDays} dage. Den nærmeste historiske tidsgruppe anvendes.`, `Time on market is outside the observed ${metadata.observedMinDays}–${metadata.observedMaxDays} days. The nearest historical time group is used.`)}</p>}
        {allSales && <p className="mt-2 text-xs text-ink-soft">{tx("Alle handler i datagrundlaget anvendes, indtil en pålidelig liggetid er tilgængelig.", "All sales in the dataset are used until a reliable time on market is available.")}</p>}
        {bracket!.count < metadata.minimumSample && <p className="mt-2 text-xs text-warning-text">{tx("Tidsgruppen har få handler. ‘Burde koste’ bygger på et begrænset grundlag.", "This time group has few sales. ‘Should cost’ uses limited evidence.")}</p>}
      </>}
      {historyStatus && <div role="status" className="mt-3 text-xs text-ink-soft"><p>{historyStatus}</p>{failed && <button type="button" className={`${buttonClass} mt-2`} onClick={onRetry}>{tx("Prøv igen", "Retry")}</button>}</div>}
      {broadScenario && historicalDataAvailable && <p data-testid="workbook-broad-scenario" className="mt-3 rounded-xl bg-warning-soft p-3 text-sm text-warning-text">{tx("Bredt historisk scenario: Boligen er uden for udvalgets boligtype eller område. Scenariet anvender historiske villasalg i Aalborg/Hasseris og er ikke baseret på lokale, sammenlignelige handler for denne bolig.", "Broad historical scenario: This home is outside the sample's property type or area. The scenario uses historical villa sales in Aalborg/Hasseris, not locally matched comparable sales for this home.")}</p>}
      {property.dataMode !== "real" && <p className="mt-2 text-xs text-warning-text">{exactOriginal ? tx("Den oprindelige pris er hentet hos kilden. Øvrige annonceoplysninger er endnu ikke bekræftet.", "The original price was retrieved from the source. Other listing details have not yet been confirmed.") : tx("Scenarie for en annonce uden bekræftede live-data.", "Scenario for a listing without confirmed live data.")}</p>}
      {property.status !== "active" && <p className="mt-2 text-xs text-ink-soft">{tx("Afsluttet annonce.", "Closed listing.")}</p>}
      <p className="mt-3 text-xs text-ink-soft">{tx("Et historisk pejlemærke, ikke en markedsvurdering. Kræver ikke fem sammenlignelige salg.", "A historical reference, not a market valuation. Five comparable sales are not required.")}</p>
      {stale && <p className="mt-3 text-xs text-warning-text">{tx("Kilden er ikke blevet bekræftet i over en uge. Pris og liggetid kan have ændret sig.", "The source has not been confirmed for over a week. Price and listing time may have changed.")}</p>}

      <details className="mt-4 border-t border-border pt-3 text-xs text-ink-soft">
        <summary className="w-fit cursor-pointer rounded font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">{tx("Datagrundlag og beregning", "Evidence and calculation")}</summary>
        <p className="mt-3 leading-relaxed">{tx(`Grundlaget er ${metadata.eligibleCount} historiske villasalg i et udvalgt kortområde i Aalborg/Hasseris. Referencen tager ikke højde for boligens stand, størrelse eller præcise beliggenhed og er ikke en markedsvurdering.`, `The basis is ${metadata.eligibleCount} historical villa sales in a selected Aalborg/Hasseris map area. This reference does not account for condition, size or exact location and is not a market valuation.`)}</p>
        {reference.baselinePrice !== null && <p className="mt-3">{exactOriginal ? tx("Oprindelig udbudspris oplyst af kilden", "Source-reported original asking price") : estimatedFirst ? tx("Beregnet første udbud", "Estimated first asking price") : tx("Dokumenteret første udbud", "Documented first asking price")}: <strong className="text-ink"><Money value={estimatedFirst ? Math.round(reference.baselinePrice / metadata.roundingDkk) * metadata.roundingDkk : reference.baselinePrice} /></strong></p>}
        {exactOriginal && <p data-testid="workbook-exact-original-source" className="mt-2">{tx("Kilde", "Source")}: {exactOriginal.source === "boligsiden" ? "Boligsiden" : exactOriginal.source} · {tx("Observeret", "Observed")} <time dateTime={exactOriginal.observedAt}>{exactOriginal.observedAt.slice(0, 10)}</time>. {exactOriginal.originalDate ? <>{tx("Oprindelig udbudsdato", "Original listing date")}: <time dateTime={exactOriginal.originalDate}>{exactOriginal.originalDate}</time>.</> : tx("Den oprindelige udbudsdato er ikke oplyst; der udledes ingen dato af prisen.", "The original listing date is not provided; no date is inferred from the price.")}</p>}
        {estimatedFirst && firstAsking !== null && <p className="mt-2">{tx("Første udbud er beregnet fra Boligsidens afrundede prisændring", "The first asking price is estimated from Boligsiden's rounded price change")}: <Money value={estimatedFirst.askingAtObservation} /> / (1 + {percent(estimatedFirst.changePercent)}), {tx("observeret", "observed")} {estimatedFirst.observedAt.slice(0, 10)}. {tx("Referencen er derfor et omtrentligt scenario, ikke en dokumenteret historisk udbudspris.", "The reference is therefore an approximate scenario, not a documented historical asking price.")}</p>}
        {!invalidSourceTiming && listing.latestEpisodeSource && <p className="mt-2">{tx("Liggetiden er kildens oplyste dagetal pr.", "Time on market is the source's reported count as of")} {listing.latestEpisodeSource.observedAt.slice(0, 10)}. {tx("Tallet fremskrives ikke mellem kildeopdateringer.", "The count is not advanced between source updates.")}</p>}
        <p className="mt-3 leading-relaxed">{tx("Oprindelig udbudspris × (1 − median historisk prisfald). Kildens præcise oprindelige pris foretrækkes, derefter dokumenteret første udbud og til sidst en første pris beregnet fra kildens registrerede pris og tilhørende prisændring. Dagens udbudspris bruges kun til sammenligning; tidligere prisnedslag trækkes ikke fra igen. Kendt liggetid vælger tidsgruppen, liggetid uden for det observerede interval bruger den nærmeste ydergruppe, og ukendt liggetid bruger medianen af alle handler. Afstanden i procent måles i forhold til dagens udbud.", "Original asking price × (1 − median historical reduction). The source's exact original price takes priority, followed by documented first asking and then first asking reconstructed from the source's recorded price and its corresponding price change. Current asking is used only for comparison; earlier reductions are not subtracted again. Known time on market selects its group; time outside the observed range uses the nearest boundary group; unknown time uses the median of all sales. The percentage gap is measured against current asking.")}</p>
        <p className="mt-2">{tx(`Beløb afrundes til ${metadata.roundingDkk.toLocaleString("da-DK")} kr. Tidsgrupper samles til mindst ${metadata.minimumSample} handler i det importerede grundlag. Intervallet viser de midterste 50 % af de historiske udfald, ikke et sikkert prisinterval for boligen.`, `Amounts are rounded to DKK ${metadata.roundingDkk.toLocaleString("en-GB")}. Time groups are pooled to at least ${metadata.minimumSample} sales in the imported dataset. The range shows the middle 50% of historical outcomes, not a guaranteed price range for this home.`)}</p>
        <div className="mt-4 overflow-x-auto"><table data-testid="workbook-historical-groups" className="w-full text-left">
          <caption className="mb-2 text-left font-medium text-ink">{tx("Alle historiske tidsgrupper", "All historical time groups")}</caption>
          <thead><tr className="border-b border-border"><th className="py-2 pr-3 font-medium">{tx("Liggetid", "Time on market")}</th><th className="py-2 pr-3 font-medium">{tx("Handler", "Sales")}</th><th className="py-2 pr-3 font-medium">{tx("Medianfald", "Median reduction")}</th><th className="py-2 font-medium">{tx("Midterste 50 %", "Middle 50%")}</th></tr></thead>
          <tbody>{[...WORKBOOK_PRICE_REFERENCE_MODEL.brackets, WORKBOOK_PRICE_REFERENCE_MODEL.aggregate].map(group => <tr key={group.label} className={`border-b border-border/60 ${bracket?.label === group.label ? "font-medium text-ink" : ""}`}><td className="py-2 pr-3">{group === WORKBOOK_PRICE_REFERENCE_MODEL.aggregate ? tx("Alle liggetider", "All listing durations") : <>{group.label} {tx("dage", "days")}</>}</td><td className="py-2 pr-3">{group.count}</td><td className="py-2 pr-3">{percent(group.medianDiscountFraction * 100)}</td><td className="whitespace-nowrap py-2">{percent(group.q1DiscountFraction * 100)} – {percent(group.q3DiscountFraction * 100)}</td></tr>)}</tbody>
        </table></div>
        <p className="mt-3">{tx("Excel-grundlag", "Workbook snapshot")}: <time dateTime={metadata.snapshotDate}>{metadata.snapshotDate}</time> · {tx("Observeret liggetid", "Observed time on market")}: {metadata.observedMinDays}–{metadata.observedMaxDays} {tx("dage", "days")}</p>
        <p className="mt-2">{tx("Seneste kildekontrol", "Last source check")}: {lastSourceCheck ? <time dateTime={lastSourceCheck}>{lastSourceCheck.slice(0, 10)}</time> : tx("Ukendt", "Unknown")} · {property.listingSource === "boligsiden" ? "Boligsiden" : "Boliga"}</p>
        <p className="mt-2 break-words">{tx("Kildefil", "Source workbook")}: {metadata.sourceFilename}</p>
      </details>
    </div>
  </section>;
}

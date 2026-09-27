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

/** Always visible on the detail page, independent of private project setup. */
export function WorkbookPriceReferenceCard({ property, history, loading, failed, onRetry }: Props) {
  const tx = useResearchText();
  const { language } = useI18n();
  const { listing, reference, firstAsking, estimatedFirst, lastSourceCheck, stale, invalidSourceTiming } = workbookListingReference(property, history);
  const { metadata, bracket } = reference;
  const eligibleListing = property.dataMode === "real" && property.status === "active";
  const ready = eligibleListing && !loading && !failed && !history?.truncated && reference.status === "available";
  const percent = (value: number) => new Intl.NumberFormat(language === "da" ? "da-DK" : "en-GB", { maximumFractionDigits: 1 }).format(value) + " %";
  const reason = !eligibleListing
    ? tx("Prisreferencen kræver en aktiv annonce med oplysninger bekræftet hos kilden. Demoannoncer og afsluttede udbud får ingen beregnet pris.", "This reference requires an active listing with source-confirmed data. Demo listings and closed listings have no calculated price.")
    : failed
      ? tx("Udbudshistorikken kunne ikke hentes. Prøv igen for at kontrollere første udbudspris og liggetid.", "Listing history could not be loaded. Retry to check the first asking price and time on market.")
      : loading
        ? tx("Henter dokumenteret første udbudspris og liggetid…", "Loading documented first asking price and time on market…")
        : history?.truncated
          ? tx("Udbudshistorikken er ufuldstændig. Første pris kan ikke fastslås sikkert, så der vises ingen beregnet pris.", "Listing history is incomplete. The first asking price cannot be established reliably, so no price is calculated.")
          : invalidSourceTiming
            ? tx("Kildehistorikken indeholder ugyldige eller fremtidige observationstidspunkter. De skal afklares, før der kan beregnes en pris.", "The source history contains invalid or future observation timestamps. They must be resolved before a price can be calculated.")
          : reference.status === "outside_scope"
            ? tx("Excel-udvalget dækker villaer i Aalborg/Hasseris (9000). Det bruges ikke til at prissætte andre boligtyper eller postnumre.", "The workbook sample covers villas in Aalborg/Hasseris (9000). It is not used to price other property types or postcodes.")
            : reference.status === "missing_first_asking"
              ? tx("Første udbudspris mangler, og en pålidelig prisændring fra kilden er ikke tilgængelig. Dagens udbudspris kan ikke erstatte første udbud; ellers kan prisfald blive talt med to gange.", "The first asking price is missing and no reliable source price-change percentage is available. Today's asking price cannot replace the first asking price, as that could count price reductions twice.")
              : reference.status === "missing_days"
                ? tx("Dokumenteret liggetid for den aktuelle annonce mangler eller er modstridende. Første gang annoncen blev set af systemet er ikke dens startdato.", "The current listing's documented time on market is missing or conflicting. The date the system first saw a listing is not its start date.")
                : reference.status === "outside_observed_range"
                  ? tx(`Liggetiden ligger uden for Excel-udvalgets ${metadata.observedMinDays}–${metadata.observedMaxDays} dage. Der beregnes ingen pris uden for det observerede interval.`, `Time on market is outside the workbook's observed ${metadata.observedMinDays}–${metadata.observedMaxDays} days. No price is calculated beyond that range.`)
                  : reference.status === "insufficient_sample"
                    ? tx(`Der er færre end ${metadata.minimumSample} brugbare handler i tidsgruppen. Grundlaget er for spinkelt til en prisreference.`, `The time group has fewer than ${metadata.minimumSample} usable sales. The sample is too small for a price reference.`)
                    : reference.status === "invalid_model"
                      ? tx("Excel-grundlaget kunne ikke valideres. Der vises ingen pris, før datagrundlaget er rettet.", "The workbook model could not be validated. No price is shown until the dataset is corrected.")
                      : null;
  const title = tx("Pris efter liggetid", "Price by time on market");
  const gap = reference.gapAmount;

  return <section aria-labelledby="workbook-price-title" aria-busy={loading} data-testid="workbook-price-reference" data-state={ready ? "available" : failed ? "error" : loading ? "loading" : reference.status} className="mt-5 overflow-hidden rounded-2xl border border-brand bg-surface shadow-card">
    <div className="border-b border-border bg-brand-soft px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="workbook-price-title" className="text-xl font-bold tracking-tight text-ink">{title}</h2>
        <span className="rounded-full border border-border-strong bg-surface px-3 py-1 text-xs font-semibold text-brand-text">{tx("Historisk pejlemærke", "Historical reference")}</span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">{tx("Hvad peger salgene i Excel-udvalget på ved denne liggetid?", "What do sales in the workbook suggest at this time on market?")}</p>
    </div>

    <div className="p-4 sm:p-6">
      {ready ? <>
        <div className="grid gap-5 sm:grid-cols-[1.2fr_1fr]">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-soft">{estimatedFirst ? tx("Omtrentlig prisreference", "Approximate price reference") : tx("Beregnet prisreference", "Calculated price reference")}</p>
            <p data-testid="workbook-target-price" className="mt-1 break-words text-3xl font-bold tracking-tight text-brand-text sm:text-4xl"><Money value={reference.referencePrice} /></p>
            <p className="mt-2 text-sm text-ink-soft">{tx("Midterste 50 % af historiske udfald", "Middle 50% of historical outcomes")}<br /><span className="font-semibold text-ink"><Money value={reference.lowerPrice} /> – <Money value={reference.upperPrice} /></span></p>
          </div>
          <div className="min-w-0 rounded-xl bg-surface-alt p-4">
            <p className="text-xs font-semibold text-ink-soft">{tx("Dagens udbudspris", "Current asking price")}</p>
            <p className="mt-1 text-xl font-bold"><Money value={property.price} /></p>
            {gap !== null && <p data-testid="workbook-price-gap" className="mt-3 text-sm">
              {gap === 0 ? tx("På niveau med prisreferencen", "In line with the price reference") : <>
                <strong><Money value={Math.abs(gap)} /></strong>{reference.gapPercent !== null && <> ({percent(Math.abs(reference.gapPercent))})</>} {gap > 0 ? tx("over prisreferencen", "above the price reference") : tx("under prisreferencen", "below the price reference")}
              </>}
            </p>}
          </div>
        </div>
        <dl className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
          <div><dt className="text-xs text-ink-soft">{tx("Aktuel liggetid", "Current time on market")}</dt><dd className="mt-1 font-bold">{listing.time.latestEpisodeDays} {tx("dage", "days")}</dd><dd className="mt-1 text-xs text-ink-soft">{tx("Tidsgruppe", "Time group")}: {bracket!.label} {tx("dage", "days")} · {bracket!.count} {tx("handler", "sales")}</dd></div>
          <div><dt className="text-xs text-ink-soft">{estimatedFirst ? tx("Beregnet første udbud", "Estimated first asking price") : tx("Dokumenteret første udbud", "Documented first asking price")}</dt><dd className="mt-1 font-bold">{estimatedFirst && <>{tx("Ca.", "Approx.")} </>}<Money value={estimatedFirst && firstAsking !== null ? Math.round(firstAsking / metadata.roundingDkk) * metadata.roundingDkk : firstAsking} /></dd></div>
          <div><dt className="text-xs text-ink-soft">{tx("Medianfald fra første udbud", "Median reduction from first asking")}</dt><dd className="mt-1 font-bold">{percent(reference.medianDiscountPercent!)}</dd><dd className="mt-1 text-xs text-ink-soft">{tx("Første udbud → salgspris", "First asking → sale price")}</dd></div>
        </dl>
        {estimatedFirst && <p className="mt-3 rounded-xl bg-warning-soft p-3 text-sm text-warning-text">{tx("Første udbud er beregnet fra Boligsidens afrundede prisændring", "The first asking price is estimated from Boligsiden's rounded price change")} ({percent(estimatedFirst.changePercent)}, {estimatedFirst.observedAt.slice(0, 10)}). {tx("Referencen er derfor et omtrentligt scenario, ikke en dokumenteret historisk udbudspris.", "The reference is therefore an approximate scenario, not a documented historical asking price.")}</p>}
        {listing.latestEpisodeSource && <p className="mt-3 text-xs text-ink-soft">{tx("Liggetiden er kildens oplyste dagetal pr.", "Time on market is the source's reported count as of")} {listing.latestEpisodeSource.observedAt.slice(0, 10)}. {tx("Tallet fremskrives ikke mellem kildeopdateringer.", "The count is not advanced between source updates.")}</p>}
      </> : <div role="status">
        <p className="text-lg font-bold">{loading && !failed ? tx("Beregner prisreference…", "Calculating price reference…") : tx("Prisreference kan ikke beregnes endnu", "Price reference is not available yet")}</p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{reason}</p>
        {failed && <button type="button" className={`${buttonClass} mt-3`} onClick={onRetry}>{tx("Prøv igen", "Retry")}</button>}
      </div>}

      <p className="mt-4 text-sm leading-relaxed text-ink-soft">{tx(`Grundlaget er ${metadata.eligibleCount} historiske villasalg i et udvalgt kortområde i Aalborg/Hasseris. Referencen tager ikke højde for boligens stand, størrelse eller præcise beliggenhed og er ikke en markedsvurdering.`, `The basis is ${metadata.eligibleCount} historical villa sales in a selected Aalborg/Hasseris map area. This reference does not account for condition, size or exact location and is not a market valuation.`)}</p>
      {stale && <p className="mt-3 rounded-xl bg-warning-soft p-3 text-sm text-warning-text">{tx("Kilden er ikke blevet bekræftet i over en uge. Udbudspris og liggetid kan have ændret sig siden seneste kildekontrol.", "The source has not been confirmed for over a week. Asking price and listing time may have changed since the last source check.")}</p>}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 text-xs text-ink-soft">
        <p>{tx("Excel-grundlag", "Workbook snapshot")}: <time dateTime={metadata.snapshotDate}>{metadata.snapshotDate}</time></p>
        <p>{tx("Seneste kildekontrol", "Last source check")}: {lastSourceCheck ? <time dateTime={lastSourceCheck}>{lastSourceCheck.slice(0, 10)}</time> : tx("Ukendt", "Unknown")} · {property.listingSource === "boligsiden" ? "Boligsiden" : "Boliga"}</p>
      </div>
      <details className="mt-3 text-xs text-ink-soft">
        <summary className="w-fit cursor-pointer rounded font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">{tx("Sådan beregnes prisen", "How the price is calculated")}</summary>
        <p className="mt-2 leading-relaxed">{tx("Første udbudspris × (1 − median samlet prisfald i tidsgruppen). Dokumenteret første pris foretrækkes; en beregnet første pris markeres tydeligt. Et samlet historisk prisfald trækkes aldrig som ekstra rabat fra dagens udbudspris. Afstanden i procent måles i forhold til dagens udbud.", "First asking price × (1 − the time group's median total price reduction). A documented first price takes priority; an estimated first price is clearly labelled. Historical total reductions are never applied as an additional discount to today's asking price. The percentage gap is measured against today's asking price.")}</p>
        <p className="mt-2">{tx(`Beløb afrundes til ${metadata.roundingDkk.toLocaleString("da-DK")} kr. Tidsgrupper samles til mindst ${metadata.minimumSample} handler. Intervallet viser de midterste 50 % af de historiske udfald, ikke et sikkert prisinterval for boligen.`, `Amounts are rounded to DKK ${metadata.roundingDkk.toLocaleString("en-GB")}. Time groups are pooled to at least ${metadata.minimumSample} sales. The range shows the middle 50% of historical outcomes, not a guaranteed price range for this home.`)}</p>
        <p className="mt-2 break-words">{tx("Kildefil", "Source workbook")}: {metadata.sourceFilename}</p>
        <p className="mt-2">{tx("Ugentlig kildekontrol opdaterer annoncerne. Excel-udvalget beholder sin viste dato, indtil et nyt dokumenteret datagrundlag importeres.", "Weekly source checks refresh listings. The workbook sample retains its displayed date until a new documented dataset is imported.")}</p>
      </details>
    </div>
  </section>;
}

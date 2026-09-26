import { estimateResearchPrice, type ResearchTimeDefinition } from "@shared/analysis";
import type { Property } from "@shared/types/index";
import type { researchListingTime } from "@/lib/research-listing-time";
import { buttonClass, Field, inputClass, Money, Panel, Percent, useResearchText } from "./fields";

type PriceReference = ReturnType<typeof estimateResearchPrice>;
type ListingTime = ReturnType<typeof researchListingTime>;

export function PriceReferencePanel({ result, property, listing, definition, onDefinition, onUsePrice, loading, failed }: {
  result: PriceReference; property: Property; listing: ListingTime; definition: ResearchTimeDefinition;
  onDefinition: (value: ResearchTimeDefinition) => void; onUsePrice: (value: number) => void;
  loading: boolean; failed: boolean;
}) {
  const tx = useResearchText();
  const usingBaseline = result.primary.median === null && result.baseline.median !== null;
  const price = usingBaseline ? result.baseline : result.primary;
  const days = result.snapshot.subject.daysOnMarket;
  const difference = price.median !== null && property.price > 0 ? property.price - price.median : null;
  const choices = [
    { value: "latest_episode_days", label: tx("Seneste udbudsperiode", "Latest listing episode"), days: listing.time.latestEpisodeDays },
    { value: "active_days", label: tx("Dokumenteret aktiv tid", "Documented active time"), days: listing.time.activeDays },
    { value: "calendar_days", label: tx("Kalendertid fra første udbud", "Calendar days from first listing"), days: listing.time.calendarDays },
  ];
  const rows = result.snapshot.sourceTransactions.filter(row => price.transactionIds.includes(row.id));
  const missingSubject = result.noDataReasons.some(issue => ["subject_not_live", "subject_area_missing", "subject_area_conflicting", "subject_property_type_missing", "subject_municipality_missing", "invalid_calculated_at"].includes(issue.code));
  if (!loading && !failed && price.median === null) return <div data-testid="listing-price-reference"><Panel title={tx("Prisgrundlag", "Price evidence")}>
    <p data-testid="listing-price-median" className="text-base font-semibold">{tx("Ingen beregnelig prisreference endnu", "No calculable price reference yet")}</p>
    <p className="mt-2 text-sm text-ink-soft">{missingSubject ? tx("Boligens kildeoplysninger skal afklares, før handler kan bruges til en prisreference.", "The listing's source details must be resolved before sales can be used for a price reference.") : result.snapshot.sourceTransactions.length === 0 ? tx("Der er endnu ikke indlæst historiske handler af samme boligtype i kommunen for de seneste 24 måneder.", "Historical sales of this property type in the municipality have not yet been loaded for the last 24 months.") : <>{result.baseline.count} {tx("egnede handler blandt", "eligible sales among")} {result.snapshot.sourceTransactions.length} {tx("indlæste salgsregistreringer. Mindst 5 skal matche boligtype, kommune, størrelse og periode.", "loaded sale records. At least 5 must match property type, municipality, size and period.")}</>}</p>
    <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-brand-text">{tx("Hvad mangler i prisgrundlaget?", "What is missing from the price evidence?")}</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">{result.noDataReasons.map(issue => <li key={issue.code}>{tx(issue.message, issue.messageEn)}</li>)}{result.excluded.some(row => row.code === "area_not_at_sale") && <li>{result.excluded.filter(row => row.code === "area_not_at_sale").length} {tx("handler mangler dokumenteret boligareal på salgsdatoen.", "sales lack documented residential area at the sale date.")}</li>}</ul><p className="mt-2 text-xs text-ink-soft">{tx("Registrerede handler i nærheden vises ovenfor, når kilden svarer. De er ikke automatisk sammenlignelige salg, og en manglende prisreference siger ikke, at boligen er forkert prissat.", "Nearby registered sales are shown above when the source responds. They are not automatically comparable sales, and a missing reference does not mean this home is mispriced.")}</p></details>
  </Panel></div>;
  return <div data-testid="listing-price-reference"><Panel title={usingBaseline ? tx("Prisreference fra sammenlignelige handler", "Price reference from comparable sales") : tx("Prisreference ud fra handler og liggetid", "Price reference from sales and time on market")}>
    {loading ? <p role="status" className="text-sm text-ink-soft">{tx("Henter handler og udbudsforløb…", "Loading sales and listing history…")}</p>
      : failed ? <p role="status" className="text-sm text-warning">{tx("Prisgrundlaget kunne ikke hentes. Genindlæs siden for at prøve igen.", "The price evidence could not be loaded. Reload the page to try again.")}</p>
      : <>
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="text-sm text-ink-soft">{usingBaseline ? tx("Prisreference uden match på liggetid", "Price reference without time matching") : tx("Vejledende pris for denne bolig", "Indicative price for this property")}</p>
            <p data-testid={usingBaseline ? "listing-price-baseline" : "listing-price-median"} className="mt-1 text-3xl font-bold tracking-tight">{price.median === null ? tx("Utilstrækkelige data", "Insufficient data") : <Money value={price.median} />}</p>
            {usingBaseline && <p data-testid="listing-price-median" className="mt-2 text-sm text-ink-soft">{tx("En reference med match på liggetid kan ikke beregnes fra det nuværende grundlag. Beløbet er alene baseret på salgspris pr. bolig-m².", "A time-matched reference cannot be calculated from the current evidence. This amount uses sold prices per residential m² only.")}</p>}
            {price.median !== null && <>
              <p data-testid="listing-price-range" className="mt-2 text-sm">{tx("Historisk spænd (Q1–Q3)", "Historical spread (Q1–Q3)")}: <Money value={price.q1} /> – <Money value={price.q3} /></p>
              <p className="mt-1 text-xs text-ink-soft">{price.count} {tx("handler i", "sales across")} {price.propertyCount} {tx("ejendomme", "properties")}</p>
              {difference !== null && <p data-testid="listing-price-gap" className="mt-3 text-sm">{difference === 0 ? tx("Dagens udbud svarer til referencen.", "Today's asking price equals the reference.") : <>{tx("Dagens udbud ligger", "Today's asking price is")} <strong><Money value={Math.abs(difference)} /></strong> {difference > 0 ? tx("over referencen", "above the reference") : tx("under referencen", "below the reference")} (<Percent value={price.median > 0 ? Math.abs(difference / price.median * 100) : null} />).</>}</p>}
              <button className={`${buttonClass} mt-3`} onClick={() => onUsePrice(Math.round(price.median!))}>{usingBaseline ? tx("Brug basisreference som budgetscenario", "Use baseline as budget scenario") : tx("Brug som budgetscenario", "Use as budget scenario")}</button>
            </>}
            {price.median === null && <ul className="mt-2 space-y-1 text-sm text-ink-soft">{result.noDataReasons.map(issue => <li key={issue.code}>{tx(issue.message, issue.messageEn)}</li>)}</ul>}
          </div>
          <div>
            <Field label={tx("Tidsdefinition til prisreference", "Time definition for price reference")}><select aria-label={tx("Tidsdefinition til prisreference", "Time definition for price reference")} className={inputClass} value={definition} onChange={e => onDefinition(e.target.value as ResearchTimeDefinition)}>{choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label} · {choice.days ?? tx("ukendt", "unknown")}{choice.days !== null ? tx(" dage", " days") : ""}</option>)}</select></Field>
            <p className="mt-3 text-sm">{tx("Boligens forløb", "This listing")}: <strong>{days ?? tx("Ukendt", "Unknown")} {days !== null && tx("dage", "days")}</strong>{result.timeGroup && !usingBaseline && <> · {tx("sammenlignet med", "compared with")} <strong>{result.timeGroup.max === null ? tx("over 365", "over 365") : result.timeGroup.label} {tx("dage", "days")}</strong></>}</p>
            <p className="mt-2 text-xs text-ink-soft">{tx("Boligens hidtidige liggetid sammenlignes med varigheden af afsluttede salg. Det forudsiger hverken resterende salgstid eller sælgers accept af et bud.", "This listing's elapsed time is compared with the duration of completed sales. It predicts neither remaining selling time nor whether the seller will accept an offer.")}</p>
            {price.count > 0 && price.count < 10 && <p className="mt-2 text-xs text-warning">{tx("Lille datagrundlag. Der kræves mindst 5 brugbare handler til en prisreference.", "Small sample. At least 5 usable sales are required for a price reference.")}</p>}
            {result.warnings.filter(issue => issue.code === "partial_dataset").map(issue => <p key={issue.code} className="mt-2 text-xs text-warning">{tx(issue.message, issue.messageEn)}</p>)}
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-surface-alt p-3 text-sm">
          {!usingBaseline && <p>{tx("Sammenlignelige salg uden match på liggetid", "Comparable sales without time matching")}: <strong>{result.baseline.median === null ? tx("Utilstrækkelige data", "Insufficient data") : <Money value={result.baseline.median} />}</strong> · {result.baseline.count} {tx("handler", "sales")}</p>}
          <p className="mt-1 text-xs text-ink-soft">{tx("Samme registrerede boligtype og kommune, ±25 % boligareal og salg inden for 24 måneder. Ingen automatisk justering for stand, renovering eller prisudvikling.", "Same recorded property type and municipality, residential area within ±25%, and sales within 24 months. No automatic adjustment for condition, renovation or market price changes.")}</p>
        </div>
        <details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold">{tx("Se beregning og handler bag prisen", "See calculation and supporting sales")}</summary>
          <p className="mt-3">{tx("Median af salgspris pr. bolig-m² × boligens areal", "Median sold price per residential m² × this property's area")}: {result.snapshot.subject.residentialArea ?? "?"} m². {tx("Historisk areal skal være knyttet til salgsdatoen. Fravalg i Sammenligninger gælder også her.", "Historical area must be tied to the sale date. Exclusions in Comparisons also apply here.")}</p>
          <p className="mt-2">{tx("Selvstændig reference fra dokumenteret første udbudspris", "Separate reference from documented first asking price")}: <strong><Money value={result.firstAskingReference.median} /></strong> · {result.firstAskingReference.count} {tx("prispar", "price pairs")}. {tx("Første udbud × (1 − median samlet prisfald). Denne reference lægges ikke oven i m²-beregningen og giver ikke ekstra rabat på dagens udbud.", "First asking price × (1 − median total price fall). This reference is not stacked on the m² calculation and does not apply an extra discount to today's asking price.")}</p>
          <ul className="my-3 list-disc space-y-1 pl-5 text-xs text-ink-soft">{[...result.noDataReasons, ...result.warnings].map(issue => <li key={issue.code}>{tx(issue.message, issue.messageEn)}</li>)}</ul>
          {rows.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">{tx("Handel / kilde", "Sale / source")}</th><th className="p-2">{tx("Salgspris", "Sold price")}</th><th className="p-2">{tx("Boligareal", "Residential area")}</th><th className="p-2">{tx("Dage", "Days")}</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-border"><td className="min-w-36 p-2">{row.address}<br />{row.saleDate} · {row.source}</td><td className="whitespace-nowrap p-2"><Money value={row.soldPrice} /></td><td className="p-2">{row.residentialArea} m²</td><td className="p-2">{definition === "active_days" ? row.activeDays : definition === "calendar_days" ? row.calendarDays : row.latestEpisodeDays}</td></tr>)}</tbody></table></div>}
          <p className="mt-3 break-all text-xs text-ink-soft">{result.snapshot.methodVersion} · {result.snapshot.dataVersion} · {result.snapshot.calculatedAt}</p>
        </details>
      </>}
  </Panel></div>;
}

export function PriceReferencePrint({ result }: { result: PriceReference }) {
  const tx = useResearchText();
  const rows = result.snapshot.sourceTransactions.filter(row => result.primary.transactionIds.includes(row.id));
  const timeLabel = result.snapshot.subject.timeDefinition === "active_days" ? tx("Dokumenteret aktiv tid", "Documented active time") : result.snapshot.subject.timeDefinition === "calendar_days" ? tx("Kalendertid fra første udbud", "Calendar days from first listing") : tx("Seneste udbudsperiode", "Latest listing episode");
  return <section><h3>{tx("Prisreference ud fra handler og liggetid", "Price reference from sales and time on market")}</h3>
    <p>{tx("Vejledende pris", "Indicative price")}: <Money value={result.primary.median} /> · Q1–Q3: <Money value={result.primary.q1} /> – <Money value={result.primary.q3} /> · {result.primary.count} {tx("handler", "sales")}</p>
    <p>{result.snapshot.subject.daysOnMarket ?? "?"} {tx("dage", "days")} · {timeLabel} · {tx("gruppe", "group")} {result.timeGroup?.label ?? "?"} · {result.snapshot.subject.residentialArea ?? "?"} m²</p>
    <p>{tx("Uden match på liggetid", "Without time matching")}: <Money value={result.baseline.median} /> · {result.baseline.count} {tx("handler", "sales")}</p>
    <p>{tx("Samme type og kommune, ±25 % boligareal, seneste 24 måneder. Historisk spænd er ikke et konfidensinterval. Stand og prisudvikling er ikke justeret.", "Same type and municipality, residential area ±25%, last 24 months. Historical spread is not a confidence interval. No condition or market price adjustment.")}</p>
    <ul>{result.noDataReasons.map(issue => <li key={issue.code}>{tx(issue.message, issue.messageEn)}</li>)}</ul>
    <ul>{result.warnings.filter(issue => ["partial_dataset", "thin_time_group_sample", "subject_area_reported", "repeated_property_sales"].includes(issue.code)).map(issue => <li key={issue.code}>{tx(issue.message, issue.messageEn)}</li>)}</ul>
    {rows.length > 0 && <><p>{tx("Op til fem handler bag prisreferencen; hele grundlaget findes i JSON-snapshot.", "Up to five supporting sales; the complete evidence is in the JSON snapshot.")}</p><ul>{rows.slice(0, 5).map(row => <li key={row.id}>{row.address} · {row.saleDate} · <Money value={row.soldPrice} /> · {row.residentialArea} m² · {row.source}</li>)}</ul></>}
    <p>{result.snapshot.methodVersion} · {result.snapshot.dataVersion} · {result.snapshot.calculatedAt}</p>
  </section>;
}

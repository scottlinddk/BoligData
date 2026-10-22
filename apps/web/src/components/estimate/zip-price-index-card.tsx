import { zipPriceIndex, type ZipPriceIndex } from "@shared/analysis/zip-price-index";
import { formatDkk } from "@shared/utils/price";
import { useI18n } from "@/i18n/i18n";
import { formatPeriod, formatSignedPercent } from "@/lib/smart-estimate";

const sqmFormat = (value: number, language: "da" | "en") => `${value.toLocaleString(language === "da" ? "da-DK" : "en-GB")} m²`;

/**
 * The home's size times the postcode's average sold price per m², for every year of the snapshot.
 * Renders nothing when the postcode is not covered or the size is unknown, so callers can mount it unconditionally.
 */
export function ZipPriceIndexCard({ postalCode, areaSqm, askingPriceDkk = null, areaSource }: {
  postalCode: string | null | undefined; areaSqm: number | null | undefined; askingPriceDkk?: number | null;
  /** Where the size comes from, since a listing's living area and a register's building area are not the same number. */
  areaSource: "listing" | "register";
}) {
  const index = zipPriceIndex({ postalCode, areaSqm });
  return index ? <ZipPriceIndexView index={index} askingPriceDkk={askingPriceDkk} areaSource={areaSource} /> : null;
}

function ZipPriceIndexView({ index, askingPriceDkk, areaSource }: { index: ZipPriceIndex; askingPriceDkk: number | null; areaSource: "listing" | "register" }) {
  const { language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const { current } = index;
  const askingVsIndex = askingPriceDkk !== null && askingPriceDkk > 0 ? askingPriceDkk / current.valueDkk - 1 : null;
  const partial = current.months < 12;
  const newestFirst = [...index.years].reverse();
  const kr = (value: number) => `${value.toLocaleString(language === "da" ? "da-DK" : "en-GB")} kr/m²`;

  return <section id="price-index" aria-labelledby="price-index-heading" data-testid="zip-price-index" className="section-anchor min-w-0 rounded-2xl bg-surface-alt p-5 sm:p-7">
    <h2 id="price-index-heading" className="text-xl font-medium tracking-tight">{tx("Prisindeks pr. m²", "Price by square meter index")}</h2>
    <p className="mt-1 text-sm text-ink-soft">{tx(`Boligens størrelse gange den gennemsnitlige salgspris pr. m² i ${index.postalCode} ${index.municipality}`, `The home's size times the average sold price per m² in ${index.postalCode} ${index.municipality}`)}</p>

    <div className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-card">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">{partial ? tx(`${current.year} indtil ${formatPeriod(index.latestMonth, language)}`, `${current.year} up to ${formatPeriod(index.latestMonth, language)}`) : String(current.year)}</p>
      <p className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.04em]" data-testid="zip-price-index-value">{formatDkk(current.valueDkk)}</p>
      <p className="mt-3 text-sm text-ink-soft">{sqmFormat(index.areaSqm, language)} × {kr(current.pricePerSqm)} = {formatDkk(current.valueDkk)}</p>
      {askingVsIndex !== null && <p className="mt-3 text-sm">{tx("Udbudsprisen er", "The asking price is")} <strong>{formatSignedPercent(askingVsIndex, language)}</strong> {tx("i forhold til prisindekset", "relative to the price index")}.</p>}
    </div>

    <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <caption className="sr-only">{tx("Boligens værdi til markedets m²-pris, år for år", "The home's value at the market's m² price, year by year")}</caption>
        <thead className="sticky top-0 bg-surface text-left text-xs text-ink-soft">
          <tr><th scope="col" className="px-4 py-2.5 font-medium">{tx("År", "Year")}</th><th scope="col" className="px-4 py-2.5 text-right font-medium">{tx("Pris pr. m²", "Price per m²")}</th><th scope="col" className="px-4 py-2.5 text-right font-medium">{tx("Boligens værdi", "Home value")}</th></tr>
        </thead>
        <tbody>
          {newestFirst.map(row => <tr key={row.year} className="border-t border-border">
            <th scope="row" className="px-4 py-2 text-left font-medium">{row.year}{row.months < 12 && <span className="ml-1.5 text-xs font-normal text-ink-soft">({tx(`${row.months} mdr.`, `${row.months} mo.`)})</span>}</th>
            <td className="px-4 py-2 text-right tabular-nums">{kr(row.pricePerSqm)}</td>
            <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatDkk(row.valueDkk)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>

    <p className="mt-4 text-xs leading-5 text-ink-soft">
      {tx("Et grovt pejlemærke, ikke en vurdering. Indekset kender kun områdets gennemsnitlige m²-pris for villaer og rækkehuse (Boligsiden Markedsindeks) og tager ikke højde for boligens stand, grund eller beliggenhed.", "A rough reference point, not an appraisal. The index only knows the area's average m² price for villas and terraced houses (Boligsiden Markedsindeks) and ignores the home's condition, plot and location.")}
      {" "}{areaSource === "listing"
        ? tx("Størrelsen er boligarealet fra annoncen.", "The size is the living area from the listing.")
        : tx("Størrelsen er bygningens areal fra BBR, som kan afvige fra boligarealet.", "The size is the building area from BBR, which can differ from the living area.")}
      {partial && " " + tx(`${current.year} er et ufuldstændigt år, så gennemsnittet kan ændre sig.`, `${current.year} is an incomplete year, so its average can still change.`)}
    </p>
  </section>;
}

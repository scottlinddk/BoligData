import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "@/i18n/i18n";
import { makeStatsFormat } from "@/lib/stats-format";
import { buildTimingFindings } from "@/lib/zip-market-findings";

/**
 * What the sales analysis and the forecast add to the timing advice: not only WHEN to buy but what a price
 * can and cannot tell a buyer. Every figure comes from `buildTimingFindings`, so none is typed in here.
 */
export function TimingFindings() {
  const { language } = useI18n();
  const tx = (da: string, en: string) => (language === "da" ? da : en);
  const f = useMemo(() => makeStatsFormat(language), [language]);
  const findings = useMemo(() => buildTimingFindings(), []);
  const { forecast, saleTypes, houseValuation } = findings;

  const share = (value: number) => `${Math.round(value * 100)} %`;
  const house = saleTypes.find((s) => s.segment === "house");
  const apartment = saleTypes.find((s) => s.segment === "apartment");
  const vsLevel = forecast.changeFromLevelPercent;
  const spread = (Math.max(...forecast.fits[0]!.season) / Math.min(...forecast.fits[0]!.season) - 1) * 100;

  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5" aria-labelledby="timing-findings-heading">
      <h3 id="timing-findings-heading" className="text-[15px] font-semibold">
        {tx("Hvad salgsdata og prognosen tilføjer", "What the sales data and the forecast add")}
      </h3>
      <ul className="mt-3 max-w-3xl space-y-3 text-sm">
        <li>
          <strong>{tx("Prisniveauet er vigtigere end måneden. ", "The price level matters more than the month. ")}</strong>
          {tx(
            `Prognosen peger på ${f.percent(vsLevel.value)} fra dagens niveau det næste år (interval ${f.percent(vsLevel.lo)} til ${f.percent(vsLevel.hi)}). Sæsonen flytter kun ca. ${f.abs(spread)}. Se `,
            `The forecast points to ${f.percent(vsLevel.value)} from today's level over the next year (range ${f.percent(vsLevel.lo)} to ${f.percent(vsLevel.hi)}). The season moves only about ${f.abs(spread)}. See `,
          )}
          <Link to="/stats?tab=forecast" className="font-medium underline">{tx("fanen Prognose", "the Forecast tab")}</Link>.
        </li>
        {house && house.familyRelative !== null && (
          <li>
            <strong>{tx("En lav pris er ikke altid en god handel. ", "A low price is not always a bargain. ")}</strong>
            {tx(
              `Familiehandler i 9000 lå typisk på ${share(house.familyRelative)} af markedsniveauet pr. m² for huse${apartment?.familyRelative != null ? ` og ${share(apartment.familyRelative)} for lejligheder` : ""}, mod ${share(house.normalRelative)}${apartment ? ` og ${share(apartment.normalRelative)}` : ""} for almindelige handler (${house.familyN} og ${house.normalN} huse). Tjek handelstypen, før en lav pris bruges som sammenligning.`,
              `Family sales in 9000 typically sat at ${share(house.familyRelative)} of the market level per m² for houses${apartment?.familyRelative != null ? ` and ${share(apartment.familyRelative)} for apartments` : ""}, against ${share(house.normalRelative)}${apartment ? ` and ${share(apartment.normalRelative)}` : ""} for ordinary sales (${house.familyN} and ${house.normalN} houses). Check the type of sale before using a low price as a comparison.`,
            )}
          </li>
        )}
        {houseValuation && (
          <li>
            <strong>{tx("Den offentlige vurdering er ikke et prisanker. ", "The public valuation is not a price anchor. ")}</strong>
            {tx(
              `Huse blev solgt til typisk ${f.one(houseValuation.medianRatio)} gange vurderingen, og de fleste mellem ${f.one(houseValuation.p10)} og ${f.one(houseValuation.p90)} gange (${houseValuation.n} salg). Brug den som en grov kontrol, ikke som en forventet pris.`,
              `Houses sold at typically ${f.one(houseValuation.medianRatio)} times the valuation, and most between ${f.one(houseValuation.p10)} and ${f.one(houseValuation.p90)} times (${houseValuation.n} sales). Use it as a rough check, not an expected price.`,
            )}
          </li>
        )}
        {findings.baselineWins.length > 0 && (
          <li>
            <strong>{tx("Sammenlignelige salg slår avancerede modeller. ", "Comparable sales beat advanced models. ")}</strong>
            {tx(
              `I testen slog ingen model den bedste enkle baseline med mindst 10 %: for huse medianen af de seneste 12 måneders salg, for lejligheder markedsindekset gange arealet. Det taler for at bruge nylige salg af tilsvarende boliger som reference for en rimelig pris.`,
              `In the test no model beat the best simple baseline by at least 10%: for houses the median of the last 12 months' sales, for apartments the market index times the area. That favours using recent sales of similar homes as the reference for a fair price.`,
            )}
          </li>
        )}
      </ul>
      <p className="mt-3 text-[12px] text-ink-soft">
        {tx(
          `Grundlag: ${findings.cleanSales} rensede salg i 9000 siden 2011 og månedsstatistikken. Små stikprøver for familiehandler og ét postnummer. Beskrivende, ikke årsagssammenhænge.`,
          `Basis: ${findings.cleanSales} cleaned sales in 9000 since 2011 and the monthly statistics. Small samples for family sales and one postcode. Descriptive, not causal.`,
        )}
      </p>
    </div>
  );
}

import { SPAR_MAX_RATIO, SPAR_MIN_RATIO } from "@shared/analysis";
import { useI18n } from "@/i18n/i18n";
import { InfoButton, InfoFormula, InfoSection, InfoSteps } from "@/components/ui/info-modal";
import { INDICATOR_DISAGREEMENT_RATIO } from "@/lib/boligdata-indicator";

const useTx = () => {
  const { language } = useI18n();
  return (da: string, en: string) => language === "da" ? da : en;
};


/** What the SPAR level and the fair price rest on. Shared by the smart estimate and the SPAR tab, since they show one number. */
function SparMethod() {
  const tx = useTx();
  return <>
    <InfoSection title={tx("1. Fra handler til et markedsniveau (SPAR)", "1. From sales to a market level (SPAR)")}>
      <p>{tx("SPAR er salgsprisen i forhold til den offentlige vurdering. Vi bruger samme fremgangsmåde som Danmarks Statistik, men regner selv på handlerne:", "SPAR is the sale price relative to the public valuation. We follow Statistics Denmark's approach but calculate from the sales ourselves:")}</p>
      <InfoSteps>
        <li>{tx("Kun almindelige frie handler medtages. Familiehandler, delgaver, offentlige sælgere og bulkhandler udelades.", "Only ordinary free-trade sales count. Family transfers, part gifts, public sellers and bulk sales are left out.")}</li>
        <li>{tx(`Handlen dateres efter købsaftalen, ikke tinglysning eller overtagelse.`, "A sale is dated by its purchase agreement, not by registration or takeover.")}</li>
        <li>{tx(`Handler med en pris under ${SPAR_MIN_RATIO} eller over ${SPAR_MAX_RATIO} gange vurderingen fjernes som ekstreme.`, `Sales priced below ${SPAR_MIN_RATIO} or above ${SPAR_MAX_RATIO} times the valuation are removed as extreme.`)}</li>
        <li>{tx("Alle handler sammenholdes med samme vurderingsår, så brøken har ét fælles grundlag.", "All sales are related to the same valuation year, so the ratio has one common base.")}</li>
        <li>{tx("Pr. måned lægges alle salgspriser sammen og divideres med summen af vurderingerne. Dyre boliger vejer dermed mere end billige.", "Per month, all sale prices are added up and divided by the sum of the valuations. Expensive homes therefore weigh more than cheap ones.")}</li>
      </InfoSteps>
    </InfoSection>
    <InfoSection title={tx("2. Udjævning", "2. Smoothing")}>
      <p>{tx("En enkelt måned har få handler, så den rå brøk svinger meget. Vi udjævner derfor niveauet over tid med en lokal-niveau-model (Kalman-filter på logaritmen til forholdet). De tre nyeste måneder får et bredere interval, fordi sene tinglysninger gør dem usikre. Måneder yngre end 13 måneder er markeret som foreløbige, ligesom Danmarks Statistiks tal.", "A single month has few sales, so the raw ratio is noisy. We therefore smooth the level over time with a local-level model (a Kalman filter on the log of the ratio). The three newest months get a wider interval, because late registrations make them uncertain. Months younger than 13 months are marked preliminary, as in Statistics Denmark's figures.")}</p>
    </InfoSection>
    <InfoSection title={tx("3. Fra niveau til fair pris", "3. From level to fair price")}>
      <InfoFormula>{tx("Fair pris = offentlig vurdering × SPAR-niveau", "Fair price = public valuation × SPAR level")}</InfoFormula>
      <p>{tx("Eksempel: en vurdering på 2.500.000 kr. og et niveau på 1,20 giver 3.000.000 kr. 80 % intervallet samler usikkerheden om niveauet og den spredning, enkelte handler plejer at have omkring niveauet. Spredningen er målt på de samme handler, som indekset bygger på, og er ikke backtestet.", "Example: a valuation of DKK 2,500,000 and a level of 1.20 gives DKK 3,000,000. The 80% interval combines the uncertainty of the level and the spread single sales usually have around it. The spread is measured on the same sales the index is built on, and is not backtested.")}</p>
    </InfoSection>
  </>;
}

function SparLimits() {
  const tx = useTx();
  return <InfoSection title={tx("Begrænsninger", "Limitations")}>
    <ul className="list-disc space-y-1.5 pl-5 marker:text-ink-soft">
      <li>{tx("Prisen siger intet om boligens stand, beliggenhed, udsigt eller renovering. To boliger med samme vurdering får samme fair pris.", "The price says nothing about the home's condition, location, view or renovation. Two homes with the same valuation get the same fair price.")}</li>
      <li>{tx("Den offentlige vurdering kan være forældet eller fejlbehæftet for den enkelte bolig.", "The public valuation can be outdated or wrong for an individual home.")}</li>
      <li>{tx("Findes kun for huse. Mangler boligen en vurdering, eller er der for få handler, vises intet estimat.", "Only available for houses. With no valuation for the home, or too few sales, no estimate is shown.")}</li>
      <li>{tx("Det er et estimat og ikke en mæglervurdering eller en vurdering fra Danmarks Statistik.", "It is an estimate, not a broker's appraisal and not Statistics Denmark data.")}</li>
    </ul>
  </InfoSection>;
}

export function SmartEstimateInfo() {
  const tx = useTx();
  return <InfoButton label={tx("Sådan beregnes smart estimat", "How the smart estimate is calculated")} title={tx("Sådan beregnes smart estimat", "How the smart estimate is calculated")}>
    <p>{tx("Smart estimat er boligens offentlige vurdering omregnet til, hvad lignende boliger faktisk sælges for lige nu. Det er samme tal som SPAR fair pris, her vist med kurve, interval og de forhold, tallet bygger på.", "The smart estimate is the home's public valuation re-priced to what similar homes actually sell for right now. It is the same number as the SPAR fair price, shown here with a curve, an interval and the factors it rests on.")}</p>
    <SparMethod />
    <InfoSection title={tx("Det du ser på siden", "What you see on the page")}>
      <ul className="list-disc space-y-1.5 pl-5 marker:text-ink-soft">
        <li>{tx("Kurven viser fair prisen for netop denne vurdering måned for måned, med 80 % interval.", "The curve shows the fair price for this exact valuation month by month, with the 80% interval.")}</li>
        <li>{tx("Udbudsprisen sammenlignes med estimatet og med selve vurderingen.", "The asking price is compared with the estimate and with the valuation itself.")}</li>
      </ul>
    </InfoSection>
    <SparLimits />
  </InfoButton>;
}

export function SparInfo() {
  const tx = useTx();
  return <InfoButton label={tx("Sådan beregnes SPAR fair pris", "How the SPAR fair price is calculated")} title={tx("Sådan beregnes SPAR fair pris", "How the SPAR fair price is calculated")}>
    <p>{tx("SPAR fair pris er, hvad boligen ville koste, hvis den blev solgt til det niveau, markedet har i forhold til de offentlige vurderinger. Denne fane viser regnestykket bag. Smart estimat bruger det samme tal.", "The SPAR fair price is what the home would cost if it sold at the level the market has relative to the public valuations. This tab shows the calculation behind it. The smart estimate uses the same number.")}</p>
    <SparMethod />
    <SparLimits />
  </InfoButton>;
}

export function BoligDataIndicatorInfo() {
  const tx = useTx();
  const disagreement = Math.round(INDICATOR_DISAGREEMENT_RATIO * 100);
  return <InfoButton label={tx("Sådan beregnes BoligData-indikatoren", "How the BoligData indicator is calculated")} title={tx("Sådan beregnes BoligData-indikatoren", "How the BoligData indicator is calculated")}>
    <p>{tx("BoligData-indikatoren er gennemsnittet af to prismetoder, der bygger på hver sin type data. Den er et samlet pejlemærke, ikke en vurdering af boligen.", "The BoligData indicator is the average of two price methods that rest on different kinds of data. It is a combined reference point, not an appraisal of the home.")}</p>
    <InfoFormula>{tx("(SPAR fair pris + Pris efter liggetid) ÷ 2", "(SPAR fair price + Price by time on market) ÷ 2")}</InfoFormula>
    <InfoSection title={tx("Hvorfor to og ikke tre tal?", "Why two numbers and not three?")}>
      <p>{tx("Smart estimat og SPAR fair pris er samme tal: begge er offentlig vurdering × SPAR-niveau. Hvis de begge indgik, ville SPAR tælle dobbelt. Vi tæller det derfor kun én gang, så de to metoder vejer lige meget.", "The smart estimate and the SPAR fair price are the same number: both are public valuation × SPAR level. If both were included, SPAR would count twice. We count it once, so the two methods weigh equally.")}</p>
    </InfoSection>
    <InfoSection title={tx("Sådan læser du den", "How to read it")}>
      <ul className="list-disc space-y-1.5 pl-5 marker:text-ink-soft">
        <li>{tx("SPAR fair pris ser på, hvad markedet betaler i forhold til den offentlige vurdering. Pris efter liggetid ser på, hvor meget lignende boliger plejer at falde fra første udbudspris.", "The SPAR fair price looks at what the market pays relative to the public valuation. Price by time on market looks at how much similar homes usually fall from their first asking price.")}</li>
        <li>{tx(`Er de to tal mere end ${disagreement} % fra hinanden, advarer vi. Så er gennemsnittet et dårligt resumé, og du bør se på de enkelte tal.`, `If the two numbers are more than ${disagreement}% apart, we warn you. The average is then a poor summary and you should look at the individual numbers.`)}</li>
        <li>{tx("Mangler en af metoderne, viser vi ingen indikator. Et gennemsnit af ét tal er bare det tal.", "If one of the methods is missing, we show no indicator. An average of one number is just that number.")}</li>
        <li>{tx("Begge metoder har de begrænsninger, der står under dem. Ingen af dem kender boligens stand, beliggenhed eller renovering, og gennemsnittet fjerner ikke den usikkerhed.", "Both methods carry the limitations listed under them. Neither knows the home's condition, location or renovation, and averaging does not remove that uncertainty.")}</li>
      </ul>
    </InfoSection>
    <p className="text-xs text-ink-soft">{tx("Afrundet til nærmeste 10.000 kr., som den grovest afrundede metode.", "Rounded to the nearest DKK 10,000, matching the more coarsely rounded method.")}</p>
  </InfoButton>;
}

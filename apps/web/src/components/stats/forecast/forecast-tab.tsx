import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { SINGLE_METHOD_MARGIN, buildForecast, type ForecastMethod } from "@shared/analysis/zip-market-forecast";
import { monthlySeries } from "@shared/analysis/zip-market-stats";
import { useI18n } from "@/i18n/i18n";
import { makeStatsFormat } from "@/lib/stats-format";
import { ForecastChart } from "./forecast-chart";

const HISTORY_MONTHS = 60;

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5 ${className}`}>{children}</div>;
}

function Stat({ label, value, range, note }: { label: string; value: string; range: string; note: string }) {
  return (
    <Card>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-[12px] tabular-nums text-ink-soft">{range}</p>
      <p className="mt-2 text-sm text-ink-soft">{note}</p>
    </Card>
  );
}

/** Twelve-month outlook for the sold price per m² in 9000. The method and its limits are in zip-market-forecast.ts. */
export function ForecastTab() {
  const { language } = useI18n();
  const tx = (da: string, en: string) => (language === "da" ? da : en);
  const f = useMemo(() => makeStatsFormat(language), [language]);
  const report = useMemo(buildForecast, []);
  const history = useMemo(() => monthlySeries("sold_per_area_price").slice(-HISTORY_MONTHS), []);

  const { nextYearAverage: next, changePercent: vsYear, changeFromLevelPercent: vsLevel, backtests } = report;
  const kr = (v: number) => `${f.int(Math.round(v / 100) * 100)} ${tx("kr", "DKK")}`;
  const firstMonth = report.path[0]!.month;
  const lastForecastMonth = report.path[report.path.length - 1]!.month;
  const alreadyHappened = (report.currentLevel / report.lastYearAverage - 1) * 100;
  const season = report.fits[0]!.season;
  const seasonSpread = (Math.max(...season) / Math.min(...season) - 1) * 100;
  const run = (m: ForecastMethod) => backtests.find((b) => b.method === m)!;
  const blend = run("blend");
  const flat = run("flat");
  const clearlyBetterThanFlat = blend.mae < flat.mae * (1 - SINGLE_METHOD_MARGIN);
  const rangeIncludesFall = vsLevel.lo < 0;

  const methodName: Record<ForecastMethod, string> = {
    flat: tx("Uændret fra nu", "Unchanged from now"),
    longrun: tx("Langsigtet vækst", "Long-run growth"),
    momentum: tx("Seneste års retning", "Latest year's direction"),
    blend: tx("Gennemsnit af de tre", "Average of the three"),
  };
  const latestYearChange = report.fits[0]!.latestYearChange * 100;
  const growthOf = (m: "flat" | "longrun" | "momentum") => report.fits.find((x) => x.method === m)!.growth * 100;

  return (
    <div>
      <section aria-labelledby="fc-head" className="mb-10">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-text">{tx("Prognose", "Forecast")}</p>
        <h2 id="fc-head" className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
          {tx(
            `Salgspris pr. m² i 9000, ${f.month(firstMonth)} til ${f.month(lastForecastMonth)}`,
            `Sold price per m² in 9000, ${f.month(firstMonth)} to ${f.month(lastForecastMonth)}`,
          )}
        </h2>
        <p className="mt-2 max-w-3xl text-base">
          {tx(
            `Vi venter en gennemsnitlig salgspris på ca. ${kr(next.value)} pr. m² det kommende år. Intervallet er ${kr(next.lo)} til ${kr(next.hi)}, og det er hentet fra de fejl, metoden faktisk lavede i bagudtest, ikke fra en antagelse.`,
            `We expect an average sold price of about ${kr(next.value)} per m² over the coming year. The range is ${kr(next.lo)} to ${kr(next.hi)}, taken from the errors the method actually made in backtests rather than from an assumption.`,
          )}
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Stat
            label={tx("Mod de seneste 12 måneder", "Against the last 12 months")}
            value={f.percent(vsYear.value)}
            range={tx(`Interval ${f.percent(vsYear.lo)} til ${f.percent(vsYear.hi)}`, `Range ${f.percent(vsYear.lo)} to ${f.percent(vsYear.hi)}`)}
            note={tx(
              `Seneste 12 måneder lå i snit på ${kr(report.lastYearAverage)}. Det meste af forskellen er allerede sket: niveauet i dag ligger ${f.abs(alreadyHappened)} over det gennemsnit.`,
              `The last 12 months averaged ${kr(report.lastYearAverage)}. Most of the gap has already happened: today's level is ${f.abs(alreadyHappened)} above that average.`,
            )}
          />
          <Stat
            label={tx("Mod niveauet i dag", "Against today's level")}
            value={f.percent(vsLevel.value)}
            range={tx(`Interval ${f.percent(vsLevel.lo)} til ${f.percent(vsLevel.hi)}`, `Range ${f.percent(vsLevel.lo)} to ${f.percent(vsLevel.hi)}`)}
            note={tx(
              `Det er det, der reelt mangler at ske. ${rangeIncludesFall ? "Intervallet rummer et fald, så retningen er ikke afgjort." : "Hele intervallet ligger over nul."} Niveauet i dag er ${kr(report.currentLevel)} efter at sæsonen er taget ud.`,
              `This is what is still left to happen. ${rangeIncludesFall ? "The range includes a fall, so the direction is not settled." : "The whole range is above zero."} Today's level is ${kr(report.currentLevel)} with the season taken out.`,
            )}
          />
        </div>

        <Card className="mt-4">
          <ForecastChart
            history={history}
            forecast={report.path}
            ariaLabel={tx("Salgspris pr. m² de seneste fem år og prognose for det næste år med interval", "Sold price per m² over the last five years and the forecast for the next year with its range")}
            historyLabel={tx("Faktisk salgspris pr. m²", "Actual sold price per m²")}
            forecastLabel={tx("Prognose", "Forecast")}
            rangeLabel={tx("80 % af udfaldene i bagudtest", "80% of outcomes in backtests")}
            formatValue={(v) => f.int(v)}
            formatMonth={f.month}
          />
        </Card>

        <details className="mt-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
          <summary className="cursor-pointer text-sm font-semibold">{tx("Måned for måned", "Month by month")}</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-right text-[13px] tabular-nums">
              <caption className="sr-only">{tx("Prognose pr. måned", "Forecast by month")}</caption>
              <thead className="text-[11px] font-semibold text-ink-soft">
                <tr>
                  <th scope="col" className="py-2 text-left">{tx("Måned", "Month")}</th>
                  <th scope="col" className="py-2">{tx("Prognose", "Forecast")}</th>
                  <th scope="col" className="py-2">{tx("Fra", "Low")}</th>
                  <th scope="col" className="py-2">{tx("Til", "High")}</th>
                </tr>
              </thead>
              <tbody>
                {report.path.map((p) => (
                  <tr key={p.month} className="border-t border-border">
                    <th scope="row" className="py-1.5 text-left font-medium">{f.month(p.month)}</th>
                    <td className="py-1.5">{f.int(Math.round(p.value))}</td>
                    <td className="py-1.5 text-ink-soft">{f.int(Math.round(p.lo))}</td>
                    <td className="py-1.5 text-ink-soft">{f.int(Math.round(p.hi))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-ink-soft">
            {tx("Intervallet er bredere, jo længere frem vi ser, fordi det følger de fejl, metoden lavede på samme afstand.", "The range widens with distance because it follows the errors the method made at the same distance.")}
          </p>
        </details>
      </section>

      <section aria-labelledby="fc-buyer" className="mb-10">
        <h2 id="fc-buyer" className="text-xl font-semibold tracking-tight">{tx("Hvad betyder det for en køber?", "What does it mean for a buyer?")}</h2>
        <ul className="mt-3 max-w-3xl space-y-2 text-sm">
          <li>
            {tx(
              `At vente et år koster i forventning ${f.percent(vsLevel.value)} oven i dagens niveau, men ${rangeIncludesFall ? "udfaldene i bagudtest spænder fra et fald til en stigning, så det er ikke et sikkert tab" : "selv det lave udfald er en stigning"}. En enkelt bolig kan afvige meget fra postnummerets gennemsnit.`,
              `Waiting a year costs ${f.percent(vsLevel.value)} on top of today's level in expectation, but ${rangeIncludesFall ? "backtest outcomes range from a fall to a rise, so it is not a certain loss" : "even the low outcome is a rise"}. A single home can differ a lot from the postcode average.`,
            )}
          </li>
          <li>
            {tx(
              `Årstiden flytter prisen mindre end usikkerheden. Mellem årets billigste og dyreste måned er der kun ca. ${f.abs(seasonSpread)} i sæsonmønsteret. Brug sæsonen til at forhandle, ikke til at time prisen. Se hvornår forhandlingsstyrken er størst under `,
              `The season moves the price less than the uncertainty does. Between the cheapest and dearest month of the year the seasonal pattern is only about ${f.abs(seasonSpread)}. Use the season to negotiate, not to time the price. See when negotiating power is greatest under `,
            )}
            <Link to="/stats" className="font-medium underline">{tx("Oversigt", "Overview")}</Link>.
          </li>
          <li>
            {tx(
              "Prognosen er en reference til at vurdere en udbudspris mod, ikke et løfte. Sammenlign altid med de seneste salg af tilsvarende boliger.",
              "The forecast is a reference to judge an asking price against, not a promise. Always compare with recent sales of similar homes.",
            )}
          </li>
        </ul>
      </section>

      <section aria-labelledby="fc-test" className="mb-10">
        <h2 id="fc-test" className="text-xl font-semibold tracking-tight">{tx("Hvor god er prognosen?", "How good is the forecast?")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          {tx(
            `Hver metode er prøvet bagud fra ${blend.origins} startpunkter. Fra hvert punkt har den kun set data frem til det punkt og skulle ramme de næste 12 måneders gennemsnit. Startpunkter en måned fra hinanden overlapper, så det svarer til ca. ${blend.windows} uafhængige år.`,
            `Each method was tried backwards from ${blend.origins} starting points. From each it saw only data up to that point and had to hit the next 12 months' average. Starting points one month apart overlap, so this is about ${blend.windows} independent years.`,
          )}
        </p>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
          <table className="w-full min-w-[560px] text-right text-[13px] tabular-nums">
            <caption className="sr-only">{tx("Bagudtest af prognosemetoder", "Backtest of forecast methods")}</caption>
            <thead className="bg-surface-alt text-[11px] font-semibold text-ink-soft">
              <tr>
                <th scope="col" className="px-3 py-2.5 text-left">{tx("Metode", "Method")}</th>
                <th scope="col" className="px-3 py-2.5">{tx("Vækst nu", "Growth now")}</th>
                <th scope="col" className="px-3 py-2.5">{tx("Gns. fejl", "Mean error")}</th>
                <th scope="col" className="px-3 py-2.5">{tx("For højt/lavt", "Too high/low")}</th>
                <th scope="col" className="px-3 py-2.5">{tx("Retning ramt", "Direction right")}</th>
              </tr>
            </thead>
            <tbody>
              {backtests.map((b) => (
                <tr key={b.method} className={`border-t border-border ${b.method === report.method ? "font-semibold" : ""}`}>
                  <th scope="row" className="px-3 py-2 text-left">{methodName[b.method]}{b.method === report.method ? ` (${tx("vist", "shown")})` : ""}</th>
                  <td className="px-3 py-2">{b.method === "blend" ? "" : `${f.percent(growthOf(b.method))}${tx(" pr. år", " a year")}`}</td>
                  <td className="px-3 py-2">{f.abs(b.mae * 100)}</td>
                  <td className="px-3 py-2">{f.percent(b.bias * 100)}</td>
                  <td className="px-3 py-2">{Math.round(b.directionHits * 100)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-3 max-w-3xl space-y-2 text-sm text-ink-soft">
          <li>
            {clearlyBetterThanFlat
              ? tx(`Gennemsnittet er tydeligt bedre end at antage uændrede priser (fejl ${f.abs(blend.mae * 100)} mod ${f.abs(flat.mae * 100)}).`, `The average is clearly better than assuming unchanged prices (error ${f.abs(blend.mae * 100)} versus ${f.abs(flat.mae * 100)}).`)
              : tx(`Prognosen er ikke tydeligt bedre end blot at sige, at priserne bliver, hvor de er nu (fejl ${f.abs(blend.mae * 100)} mod ${f.abs(flat.mae * 100)}). Med så få uafhængige år kan de tre metoder ikke skilles ad.`, `The forecast is not clearly better than simply saying prices stay where they are now (error ${f.abs(blend.mae * 100)} versus ${f.abs(flat.mae * 100)}). With so few independent years the three methods cannot be told apart.`)}
          </li>
          <li>
            {tx(
              `Derfor vises gennemsnittet af de tre, og ikke den enkelte metode, der scorer lavest, men kun lidt (${methodName[report.bestSingle].toLowerCase()}). En enkeltmetode erstatter først gennemsnittet, hvis den er mindst ${Math.round(SINGLE_METHOD_MARGIN * 100)} % bedre. Reglen er fastlagt på forhånd.`,
              `So the average of the three is shown, not the single method that scores lowest, but only slightly (${methodName[report.bestSingle].toLowerCase()}). A single method replaces the average only if it is at least ${Math.round(SINGLE_METHOD_MARGIN * 100)}% better. The rule was fixed in advance.`,
            )}
          </li>
          <li>
            {tx(
              `De tre antager vækst fra ${f.percent(growthOf("flat"))} til ${f.percent(growthOf("momentum"))} om året. "Seneste års retning" lægger vægt på det seneste års stigning på ${f.percent(latestYearChange)}, som er usædvanligt højt i historikken.`,
              `The three assume growth from ${f.percent(growthOf("flat"))} to ${f.percent(growthOf("momentum"))} a year. "Latest year's direction" leans on the latest year's rise of ${f.percent(latestYearChange)}, which is unusually high in the history.`,
            )}
          </li>
        </ul>
      </section>

      <section aria-labelledby="fc-caveats" className="mb-12">
        <h2 id="fc-caveats" className="text-xl font-semibold tracking-tight">{tx("Forbehold", "Caveats")}</h2>
        <ul className="mt-3 max-w-3xl list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
          <li>
            {tx(
              `Historikken er ${report.historyMonths} måneder (${f.month(report.historyFrom)} til ${f.month(report.lastMonth)}), altså mere end 13 år. Alt er brugt.`,
              `The history is ${report.historyMonths} months (${f.month(report.historyFrom)} to ${f.month(report.lastMonth)}), so more than 13 years. All of it is used.`,
            )}
          </li>
          <li>{tx("Kun ét postnummer, og tallene er månedlige gennemsnit for villaer og rækkehuse, ikke enkeltsalg.", "One postcode only, and the figures are monthly averages for houses and terraced houses, not individual sales.")}</li>
          <li>{tx("Prognosen bruger kun prisserien selv. Renter, indkomst, nybyggeri og lovændringer indgår ikke, og de forklarer meget af udsvingene i 2020 til 2023. Historikken rummer én boom og ét rentechok, og en prognose kan ikke kende det næste.", "The forecast uses the price series only. Interest rates, income, construction and law changes are not included, and they explain much of the swings in 2020 to 2023. The history holds one boom and one rate shock, and a forecast cannot know the next.")}</li>
          <li>{tx("De seneste måneder er støjende. Enkelte måneder kan hoppe flere procent. Brug niveauet over flere måneder.", "The latest months are noisy. Single months can jump several percent. Read the level over several months.")}</li>
          <li>{tx("Det er en statistisk fremskrivning, ikke rådgivning og ikke en prognose for en bestemt bolig.", "This is a statistical extrapolation, not advice and not a forecast for any particular home.")}</li>
        </ul>
      </section>
    </div>
  );
}

import { useMemo } from "react";
import { useI18n } from "@/i18n/i18n";
import { makeStatsFormat } from "@/lib/stats-format";
import { monthRuns } from "@shared/analysis/zip-market-timing";
import {
  buildTimingView,
  capitalize,
  describeRuns,
  levelOf,
  type Level,
  type MonthCategory,
} from "@/lib/zip-market-timing-view";
import type { TimingSignalKey } from "@shared/analysis/zip-market-timing";

const CLAMP = 2;

/** Background that deepens with how much a month favours a buyer; neutral grey when it does not. Text always carries the value. */
function cellStyle(z: number): React.CSSProperties {
  const strength = Math.min(Math.abs(z), CLAMP) / CLAMP;
  return z >= 0
    ? { background: `color-mix(in srgb, var(--color-success) ${Math.round(strength * 38)}%, transparent)` }
    : { background: `color-mix(in srgb, var(--color-text-secondary) ${Math.round(strength * 12)}%, transparent)` };
}

function categoryStyle(category: MonthCategory): React.CSSProperties {
  switch (category) {
    case "negotiate":
      return { background: "color-mix(in srgb, var(--color-success) 28%, transparent)" };
    case "balance":
      return { background: "color-mix(in srgb, var(--color-success) 48%, transparent)" };
    case "choice":
      return { background: "color-mix(in srgb, var(--color-brand) 22%, transparent)" };
    case "fast":
      return { background: "color-mix(in srgb, var(--color-text-secondary) 14%, transparent)" };
    default:
      return {};
  }
}

export function TimingGuide() {
  const { language } = useI18n();
  const tx = (da: string, en: string) => (language === "da" ? da : en);
  const f = useMemo(() => makeStatsFormat(language), [language]);
  const view = useMemo(buildTimingView, []);

  const locale = language === "da" ? "da-DK" : "en-GB";
  const shortNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(Date.UTC(2025, i, 1))).replace(".", ""));
  }, [locale]);
  const longNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" });
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(Date.UTC(2025, i, 1))));
  }, [locale]);

  const to = tx("til", "to");
  const and = tx("og", "and");
  const leverageText = describeRuns(view.leverageRuns, longNames, to, and);
  const selectionText = describeRuns(view.selectionRuns, longNames, to, and);
  const sellerText = describeRuns(view.sellerRuns, longNames, to, and);
  const solidText = describeRuns(monthRuns(view.solidLeverageMonths), longNames, to, and);
  const best = longNames[view.bestLeverageMonth - 1]!;
  const balanced = view.balancedMonths.map((m) => longNames[m - 1]!);
  const balancedIsTentative = view.balancedMonths.some((m) => !view.solidLeverageMonths.includes(m));

  const currentMonth = useMemo(() => new Date().getMonth() + 1, []);
  const categoryLabel: Record<MonthCategory, string> = {
    negotiate: tx("Forhandl", "Negotiate"),
    balance: tx("Balance", "Balance"),
    choice: tx("Udvalg", "Choice"),
    fast: tx("Hurtigt", "Fast"),
    neutral: tx("Middel", "Middle"),
  };

  const levelLabel: Record<Level, string> = {
    high: tx("Høj", "High"),
    middle: tx("Middel", "Medium"),
    low: tx("Lav", "Low"),
  };

  interface DetailRow {
    key: TimingSignalKey;
    label: string;
    unit: string;
    format: (value: number) => string;
  }
  const detailRows: DetailRow[] = [
    { key: "daysOnMarket", label: tx("Salgstid (liggetid)", "Days on market"), unit: "%", format: (v) => f.percent(v) },
    { key: "discount", label: tx("Afslag pr. m²", "Discount per m²"), unit: tx("kr.", "DKK"), format: (v) => `${v > 0 ? "+" : ""}${f.int(v)}` },
    { key: "supply", label: tx("Boliger til salg", "Homes for sale"), unit: "%", format: (v) => f.percent(v) },
    { key: "sold", label: tx("Salgspris pr. m²", "Sold price per m²"), unit: "%", format: (v) => f.percent(v) },
  ];

  const { waiting } = view;
  const latestLabel = (key: string) =>
    key === "daysOnMarket" ? tx("Salgstid", "Days on market") : key === "supply" ? tx("Boliger til salg", "Homes for sale") : tx("Afslag pr. m²", "Discount per m²");

  return (
    <section aria-labelledby="timing-heading" className="mb-12">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-text">{tx("For købere", "For buyers")}</p>
      <h2 id="timing-heading" className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
        {tx("Hvornår er det bedste tidspunkt at købe?", "When is the best time to buy?")}
      </h2>

      <div className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
        <p className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {tx(`Køb helst i ${leverageText}.`, `Buy in ${leverageText} if you can.`)}
        </p>
        <p className="mt-2 max-w-3xl text-base">
          {tx(
            `Her er salgstiden længst og afslaget størst, så du kan forhandle. ${capitalize(best)} er stærkest.`,
            `Homes take longest to sell and discounts are largest, so you can negotiate. ${capitalize(best)} is the strongest.`,
          )}
        </p>
        <ul className="mt-3 max-w-3xl space-y-1.5 text-sm text-ink-soft">
          <li>
            {tx(
              `Du vil have mest at vælge imellem i ${selectionText}, men så sælges boligerne hurtigt, og afslaget er mindst.`,
              `You get the most to choose from in ${selectionText}, but homes sell fast and discounts are smallest.`,
            )}
          </li>
          {balanced.length > 0 && (
            <li>
              {tx(
                `Bedste kompromis: ${balanced.join(", ")}. Høj forhandlingsstyrke og normalt udbud.${balancedIsTentative ? " Evidensen er svagere end for januar til marts." : ""}`,
                `Best compromise: ${balanced.join(", ")}. High negotiating power and normal supply.${balancedIsTentative ? " The evidence is weaker than for January to March." : ""}`,
              )}
            </li>
          )}
          <li>
            {tx(
              `Sikrest er ${solidText}. Der er mønstret statistisk solidt. De øvrige vintermåneder peger samme vej, men med mere usikkerhed.`,
              `Most certain is ${solidText}, where the pattern is statistically solid. The other winter months point the same way with more uncertainty.`,
            )}
          </li>
        </ul>

        <ol className="mt-5 grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-12" aria-label={tx("De tolv måneder", "The twelve months")}>
          {view.months.map((m, i) => {
            const category = view.categories[i]!;
            const isNow = m.month === currentMonth;
            return (
              <li
                key={m.month}
                className={`rounded-xl border px-1.5 py-2 text-center ${isNow ? "border-brand ring-2 ring-brand" : "border-border"}`}
                style={categoryStyle(category)}
              >
                <span className="block text-[11px] text-ink-soft">{isNow ? tx("Nu", "Now") : "\u00a0"}</span>
                <span className="block text-sm font-semibold">{capitalize(shortNames[i]!)}</span>
                <span className="mt-0.5 block text-[11px] font-semibold">{categoryLabel[category]}</span>
              </li>
            );
          })}
        </ol>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-[12px] text-ink-soft sm:grid-cols-2">
          <div><dt className="inline font-semibold text-ink">{categoryLabel.negotiate}: </dt><dd className="inline">{tx("godt at forhandle, begrænset udvalg", "good for negotiating, limited choice")}</dd></div>
          <div><dt className="inline font-semibold text-ink">{categoryLabel.balance}: </dt><dd className="inline">{tx("godt at forhandle og normalt udbud", "good for negotiating and normal supply")}</dd></div>
          <div><dt className="inline font-semibold text-ink">{categoryLabel.choice}: </dt><dd className="inline">{tx("mange boliger, men de sælges hurtigt", "many homes, but they sell fast")}</dd></div>
          <div><dt className="inline font-semibold text-ink">{categoryLabel.fast}: </dt><dd className="inline">{tx("hurtigt marked, lidt at forhandle med", "fast market, little room to negotiate")}</dd></div>
        </dl>
      </div>

      <details className="mt-6 group">
        <summary className="cursor-pointer text-sm font-semibold underline-offset-2 hover:underline">
          {tx("Se tallene bag, måned for måned", "See the numbers behind it, month by month")}
        </summary>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
        <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
          <caption className="sr-only">{tx("Måned for måned: hvor gunstig tidspunktet er for en køber", "Month by month: how favourable the timing is for a buyer")}</caption>
          <thead>
            <tr className="border-b border-border text-left text-ink-soft">
              <th scope="col" className="sticky left-0 z-10 bg-surface p-2.5 font-semibold">{tx("Gunstigt for køber", "Favourable for buyer")}</th>
              {shortNames.map((n) => (
                <th key={n} scope="col" className="p-2 text-center font-semibold">{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {([
              { label: tx("Forhandlingsstyrke", "Negotiating power"), pick: (i: number) => view.months[i]!.leverage },
              { label: tx("Udvalg", "Choice"), pick: (i: number) => view.months[i]!.selection },
            ] as const).map((row) => (
              <tr key={row.label} className="border-b border-border">
                <th scope="row" className="sticky left-0 z-10 bg-surface p-2.5 text-left font-semibold">{row.label}</th>
                {view.months.map((m, i) => {
                  const z = row.pick(i);
                  return (
                    <td key={m.month} className="p-2 text-center font-semibold" style={cellStyle(z)}>
                      {levelLabel[levelOf(z)]}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td colSpan={13} className="bg-surface-alt px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                {tx("Bag tallene: afvigelse fra årets trend", "Behind the ratings: deviation from the year's trend")}
              </td>
            </tr>
            {detailRows.map((row) => (
              <tr key={row.key} className="border-b border-border last:border-b-0">
                <th scope="row" className="sticky left-0 z-10 bg-surface p-2.5 text-left font-medium">
                  {row.label}
                </th>
                {view.months.map((m) => {
                  const s = m.signals[row.key];
                  return (
                    <td key={m.month} className="p-2 text-center tabular-nums" style={cellStyle(m.favourability[row.key])} title={tx(`${s.years} år, ${Math.round(s.agreement * 100)} % enige i retning`, `${s.years} years, ${Math.round(s.agreement * 100)}% agree on direction`)}>
                      {row.format(s.mean)}
                      <span aria-label={s.reliable ? tx("pålideligt", "reliable") : tx("usikkert", "uncertain")} className={s.reliable ? "ml-0.5 text-brand" : "ml-0.5 text-ink-faint"}>
                        {s.reliable ? "●" : "○"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 max-w-3xl text-[12px] text-ink-soft">
        {tx(
          "● mønstret går igen i mindst 70 % af årene og er tydeligt større end udsvingene fra år til år. ○ mønstret er usikkert. Grøn baggrund betyder gunstigt for køber, grå betyder ugunstigt. Baseret på 14-15 år pr. måned, efter at markedets egen trend er fjernet.",
          "● the pattern repeats in at least 70% of years and is clearly larger than the year-to-year swings. ○ the pattern is uncertain. Green means favourable for a buyer, grey means unfavourable. Based on 14-15 years per month, after removing the market's own trend.",
        )}
      </p>
      </details>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-[13px] font-semibold">{tx("Sæson mod markedets retning", "Season versus market direction")}</h3>
          <p className="mt-2 text-sm text-ink-soft">
            {tx(
              `Forskellen mellem årets dyreste og billigste måned i salgsprisen er kun ca. ${f.abs(waiting.seasonalSpreadPercent)}${waiting.seasonalPriceReliable ? "" : " og er ikke statistisk pålidelig"}. Til sammenligning er salgsprisen i ${f.month(waiting.latestMonth)} ${f.percent(waiting.yearOverYearPercent)} ift. et år tidligere.`,
              `The gap between the dearest and cheapest month of the year in the sold price is only about ${f.abs(waiting.seasonalSpreadPercent)}${waiting.seasonalPriceReliable ? "" : " and is not statistically reliable"}. By comparison, the sold price in ${f.month(waiting.latestMonth)} is ${f.percent(waiting.yearOverYearPercent)} versus a year earlier.`,
            )}
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            {tx(
              "Sæsonen giver altså forhandlingsrum, men ikke en billigere pris i sig selv. Hvis markedet stiger, kan en udsættelse koste mere, end vinterens forhandling sparer. Det er historik, ikke en prognose.",
              "So the season buys negotiating room, not a cheaper price by itself. If the market is rising, waiting can cost more than winter negotiation saves. This is history, not a forecast.",
            )}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-[13px] font-semibold">
            {tx(`Lige nu: ${f.month(view.latest[0]?.month ?? waiting.latestMonth)} mod samme måned de seneste år`, `Right now: ${f.month(view.latest[0]?.month ?? waiting.latestMonth)} versus the same month in earlier years`)}
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {view.latest.map((item) => (
              <li key={item.key} className="flex items-baseline justify-between gap-3">
                <span className="text-ink-soft">{latestLabel(item.key)}</span>
                <span className="text-right tabular-nums">
                  <strong>{item.mode === "percent" ? f.percent(item.difference) : `${item.difference > 0 ? "+" : ""}${f.int(item.difference)} ${tx("kr.", "DKK")}`}</strong>{" "}
                  {item.mode === "percent" && Math.abs(item.difference) < 2 ? (
                    <span className="text-ink-soft">{tx("omtrent normalt", "about normal")}</span>
                  ) : (
                    <span className={item.favoursBuyer ? "text-success-text" : "text-ink-soft"}>
                      {item.favoursBuyer ? tx("gunstigt for køber", "favours buyers") : tx("gunstigt for sælger", "favours sellers")}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-ink-soft">
            {tx(`Gennemsnit af samme måned i de ${view.latest[0]?.years ?? 5} foregående år.`, `Average of the same month over the previous ${view.latest[0]?.years ?? 5} years.`)}
          </p>
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-[12px] text-ink-soft">
        {tx(
          `Omvendt for sælgere: ${sellerText} giver kortest salgstid og mindst afslag. Forbehold: ét postnummer, månedlige gennemsnit og ikke enkeltsalg. Salgstiden regnes ved salget, så vinterens lange tal delvist afspejler boliger sat til salg i efteråret. Mønstre er ikke årsager, og en bestemt bolig kan afvige meget. Tallene er ikke rådgivning.`,
          `The reverse holds for sellers: ${sellerText} has the shortest time to sell and the smallest discounts. Caveats: one postcode, monthly averages rather than individual sales. Days on market is measured at the sale, so winter's long figures partly reflect homes listed in autumn. Patterns are not causes, and a particular home can differ a lot. This is not advice.`,
        )}
      </p>
    </section>
  );
}

import type { Language } from "@/i18n/translations";
import {
  MARKET_PHASES,
  correlationStrength,
  lastMonthAtOrAbove,
  largestMonthOverMonthMove,
  statSeries,
  type CorrelationStrength,
  type LeadLagResult,
  type MarketPhaseId,
  type PairCorrelation,
  type PhaseSummary,
  type StatSeriesKey,
  type ZipMarketRelationships,
} from "@shared/analysis/zip-market-relationships";
import { makeStatsFormat, type StatsFormat } from "./stats-format";

/**
 * Written remarks for the /stats page. The wording is fixed, the numbers are
 * not: every figure is read from the computed summaries, so a refreshed
 * snapshot updates them. The qualitative claims (who rose, who fell, which
 * relationship is strongest) are pinned by tests in zip-market-relationships.test.ts,
 * so a refresh that changes the story fails a test instead of leaving stale prose.
 */

const SERIES_LABELS: Record<StatSeriesKey, { da: string; en: string; unit: { da: string; en: string } }> = {
  sold: { da: "Salgspris pr. m²", en: "Sold price per m²", unit: { da: "kr./m²", en: "DKK/m²" } },
  asking: { da: "Udbudspris pr. m² (villa)", en: "Asking price per m² (villa)", unit: { da: "kr./m²", en: "DKK/m²" } },
  supply: { da: "Villaer til salg", en: "Villas for sale", unit: { da: "stk.", en: "homes" } },
  daysOnMarket: { da: "Salgstid (dage)", en: "Days on market (sold)", unit: { da: "dage", en: "days" } },
  discount: { da: "Gns. afslag pr. m²", en: "Average discount per m²", unit: { da: "kr./m²", en: "DKK/m²" } },
};

export function seriesLabel(key: StatSeriesKey, language: Language): string {
  return SERIES_LABELS[key][language];
}

export function seriesUnit(key: StatSeriesKey, language: Language): string {
  return SERIES_LABELS[key].unit[language];
}

export interface PhaseRemark {
  id: MarketPhaseId;
  number: number;
  title: string;
  period: string;
  body: string;
  /** Start-to-end change per series, for the chips under the text. */
  changes: { key: StatSeriesKey; label: string; text: string; percent: number | null }[];
}

export function buildPhaseRemarks(language: Language, summaries: PhaseSummary[]): PhaseRemark[] {
  const f = makeStatsFormat(language);
  const L = (da: string, en: string) => (language === "da" ? da : en);
  const metrics = (id: MarketPhaseId) => summaries.find((s) => s.phase.id === id)!.metrics;
  const sold = statSeries("sold");
  const tom = statSeries("daysOnMarket");
  const soldAt = (month: string) => sold.find((p) => p.month === month)!.value;
  const pct = (end: number, start: number) => ((end - start) / start) * 100;

  const soft = metrics("soft-bottom");
  const rec = metrics("recovery");
  const plat = metrics("plateau");
  const covid = metrics("covid-dip");
  const boom = metrics("squeeze-boom");
  const cool = metrics("cooling");
  const slow = metrics("slow-high-supply");
  const rebound = metrics("price-rebound");

  const covidSoldDrop = pct(covid.sold.min.value, soldAt("2020-01"));
  const covidAskingDrop = pct(covid.asking.min.value, covid.asking.start);
  const boomToCoolingAskingDrop = pct(cool.asking.min.value, boom.asking.max.value);
  const soldFromPeak = pct(cool.sold.min.value, boom.sold.max.value);
  const supplyPeakVsLow = slow.supply.max.value / boom.supply.min.value;
  const slowestSince = lastMonthAtOrAbove(tom, slow.daysOnMarket.max.value, slow.daysOnMarket.max.month);
  const jump = largestMonthOverMonthMove(sold, { from: MARKET_PHASES.find((p) => p.id === "price-rebound")!.from });

  const text: Record<MarketPhaseId, { title: string; body: string }> = {
    "soft-bottom": {
      title: L("Svagt marked og bund i salgspriserne", "Soft market and a sold-price low"),
      body: L(
        `Salgsprisen gled ned til ${f.int(soft.sold.min.value)} kr./m² i ${f.month(soft.sold.min.month)}, det laveste niveau i hele perioden, mens udbudsprisen kun gav efter ${f.abs(pct(soft.asking.min.value, soft.asking.start))} til ${f.int(soft.asking.min.value)} (${f.month(soft.asking.min.month)}). Udbuddet var højt (${f.int(soft.supply.min.value)} til ${f.int(soft.supply.max.value)} villaer), og køberne fik store afslag: i gennemsnit ${f.int(soft.discount.average)} kr./m², højest ${f.int(soft.discount.max.value)} i ${f.month(soft.discount.max.month)}. Allerede her ses mønstret, at salgsprisen reagerer kraftigere end udbudsprisen.`,
        `The sold price slid to ${f.int(soft.sold.min.value)} DKK/m² in ${f.month(soft.sold.min.month)}, the lowest level of the whole history, while the asking price only gave way ${f.abs(pct(soft.asking.min.value, soft.asking.start))} to ${f.int(soft.asking.min.value)} (${f.month(soft.asking.min.month)}). Supply was high (${f.int(soft.supply.min.value)} to ${f.int(soft.supply.max.value)} villas) and buyers got large discounts: ${f.int(soft.discount.average)} DKK/m² on average, up to ${f.int(soft.discount.max.value)} in ${f.month(soft.discount.max.month)}. The pattern of the sold price reacting harder than the asking price is already visible here.`,
      ),
    },
    recovery: {
      title: L("Opsving: alle serier peger samme vej", "Recovery: every series points the same way"),
      body: L(
        `Salgsprisen steg ${f.abs(rec.sold.changePercent)} fra ${f.int(rec.sold.start)} til ${f.int(rec.sold.end)} kr./m², udbudsprisen ${f.abs(rec.asking.changePercent)}. Samtidig faldt antallet af villaer til salg ${f.abs(rec.supply.changePercent)} (fra ${f.int(rec.supply.start)} til ${f.int(rec.supply.end)}), salgstiden faldt fra ${f.int(rec.daysOnMarket.start)} til ${f.int(rec.daysOnMarket.end)} dage (lavest ${f.int(rec.daysOnMarket.min.value)} i ${f.month(rec.daysOnMarket.min.month)}), og afslaget skrumpede til ${f.int(rec.discount.min.value)} kr./m² på det mindste (${f.month(rec.discount.min.month)}). Faldende udbud, hurtigere salg, mindre afslag og stigende priser kom i samme periode.`,
        `The sold price rose ${f.abs(rec.sold.changePercent)} from ${f.int(rec.sold.start)} to ${f.int(rec.sold.end)} DKK/m², the asking price ${f.abs(rec.asking.changePercent)}. At the same time villas for sale fell ${f.abs(rec.supply.changePercent)} (from ${f.int(rec.supply.start)} to ${f.int(rec.supply.end)}), days on market fell from ${f.int(rec.daysOnMarket.start)} to ${f.int(rec.daysOnMarket.end)} (lowest ${f.int(rec.daysOnMarket.min.value)} in ${f.month(rec.daysOnMarket.min.month)}), and the discount shrank to ${f.int(rec.discount.min.value)} DKK/m² at its smallest (${f.month(rec.discount.min.month)}). Falling supply, faster sales, smaller discounts and rising prices all arrived together.`,
      ),
    },
    plateau: {
      title: L("Plateau: stigende udbud under en flad overflade", "Plateau: growing supply under a flat surface"),
      body: L(
        `Udbudsprisen toppede på ${f.int(plat.asking.max.value)} i ${f.month(plat.asking.max.month)} og endte perioden ${f.abs(pct(plat.asking.end, plat.asking.max.value))} under toppen, mens salgsprisen krøb op til ${f.int(plat.sold.max.value)} (${f.month(plat.sold.max.month)}). Under overfladen voksede lageret: villaer til salg steg ${f.abs(plat.supply.changePercent)} til et højdepunkt på ${f.int(plat.supply.max.value)} i ${f.month(plat.supply.max.month)}, og det gennemsnitlige afslag steg ${f.abs(plat.discount.changePercent)} (fra ${f.int(plat.discount.start)} til ${f.int(plat.discount.end)} kr./m²). Udbudsprisen vendte altså flere måneder før salgsprisen.`,
        `The asking price peaked at ${f.int(plat.asking.max.value)} in ${f.month(plat.asking.max.month)} and ended the phase ${f.abs(pct(plat.asking.end, plat.asking.max.value))} below that peak, while the sold price crept up to ${f.int(plat.sold.max.value)} (${f.month(plat.sold.max.month)}). Beneath the surface the stock was growing: villas for sale rose ${f.abs(plat.supply.changePercent)} to a peak of ${f.int(plat.supply.max.value)} in ${f.month(plat.supply.max.month)}, and the average discount rose ${f.abs(plat.discount.changePercent)} (from ${f.int(plat.discount.start)} to ${f.int(plat.discount.end)} DKK/m²). The asking price turned months before the sold price did.`,
      ),
    },
    "covid-dip": {
      title: L("2020: skarpt dyk i salgsprisen, næsten intet i udbudsprisen", "2020: a sharp dip in the sold price, almost none in the asking price"),
      body: L(
        `Salgsprisen faldt ${f.abs(covidSoldDrop)} fra januar til ${f.int(covid.sold.min.value)} i ${f.month(covid.sold.min.month)}, og salgstiden steg til ${f.int(covid.daysOnMarket.max.value)} dage. Udbudsprisen bevægede sig kun ${f.percent(covidAskingDrop)} i de samme måneder. Salgsprisen er et gennemsnit af relativt få handler, så et enkelt kvartal kan svinge kraftigt. Opsvinget var lige så hurtigt: i december var udbudsprisen ${f.abs(covid.asking.changePercent)} over januar, udbuddet var nede på ${f.int(covid.supply.end)}, og afslaget var skrumpet til ${f.int(covid.discount.end)} kr./m². Perioden falder sammen med de første nedlukninger under covid-19. Datasættet indeholder ingen oplysninger om årsagen.`,
        `The sold price fell ${f.abs(covidSoldDrop)} from January to ${f.int(covid.sold.min.value)} in ${f.month(covid.sold.min.month)}, and days on market rose to ${f.int(covid.daysOnMarket.max.value)}. The asking price moved only ${f.percent(covidAskingDrop)} over the same months. The sold price is an average of relatively few sales, so a single quarter can swing it hard. The rebound was just as quick: by December the asking price was ${f.abs(covid.asking.changePercent)} above January, supply was down to ${f.int(covid.supply.end)} and the discount had shrunk to ${f.int(covid.discount.end)} DKK/m². The phase coincides with the first covid-19 lockdowns. The data itself says nothing about the cause.`,
      ),
    },
    "squeeze-boom": {
      title: L("Knaphed og boom", "Scarcity and boom"),
      body: L(
        `Antallet af villaer til salg faldt til ${f.int(boom.supply.min.value)} i ${f.month(boom.supply.min.month)}, det laveste i hele perioden. Boligerne blev i gennemsnit solgt på kun ${f.int(boom.daysOnMarket.min.value)} dage (${f.month(boom.daysOnMarket.min.month)}), afslaget var nede på ${f.int(boom.discount.min.value)} kr./m² (${f.month(boom.discount.min.month)}), og udbudsprisen steg ${f.abs(boom.asking.changePercent)} til en top på ${f.int(boom.asking.max.value)} (${f.month(boom.asking.max.month)}). Salgsprisen toppede tidligere, på ${f.int(boom.sold.max.value)} i ${f.month(boom.sold.max.month)}, og var på vej ned igen ved periodens slutning.`,
        `Villas for sale fell to ${f.int(boom.supply.min.value)} in ${f.month(boom.supply.min.month)}, the lowest of the whole history. Homes sold in just ${f.int(boom.daysOnMarket.min.value)} days on average (${f.month(boom.daysOnMarket.min.month)}), the discount fell to ${f.int(boom.discount.min.value)} DKK/m² (${f.month(boom.discount.min.month)}), and the asking price rose ${f.abs(boom.asking.changePercent)} to a peak of ${f.int(boom.asking.max.value)} (${f.month(boom.asking.max.month)}). The sold price peaked earlier, at ${f.int(boom.sold.max.value)} in ${f.month(boom.sold.max.month)}, and was already heading down by the end of the phase.`,
      ),
    },
    cooling: {
      title: L("Afkøling: udbud op, salgstid op, priser ned", "Cooling: supply up, days on market up, prices down"),
      body: L(
        `Villaer til salg steg ${f.abs(cool.supply.changePercent)} fra ${f.int(cool.supply.start)} til ${f.int(cool.supply.end)}, og salgstiden steg ${f.abs(cool.daysOnMarket.changePercent)} fra ${f.int(cool.daysOnMarket.start)} til ${f.int(cool.daysOnMarket.end)} dage (højest ${f.int(cool.daysOnMarket.max.value)} i ${f.month(cool.daysOnMarket.max.month)}). Udbudsprisen faldt ${f.abs(boomToCoolingAskingDrop)} fra toppen til ${f.int(cool.asking.min.value)} (${f.month(cool.asking.min.month)}), og salgsprisen endte på ${f.int(cool.sold.min.value)} i ${f.month(cool.sold.min.month)}, ${f.abs(soldFromPeak)} under toppen fra ${f.month(boom.sold.max.month)}. Afslaget nåede ${f.int(cool.discount.max.value)} kr./m² i ${f.month(cool.discount.max.month)}. Timingen ligner perioden med stigende boligrenter 2022-23, men datasættet indeholder ingen renter, så sammenhængen er baggrund og ikke et fund.`,
        `Villas for sale rose ${f.abs(cool.supply.changePercent)} from ${f.int(cool.supply.start)} to ${f.int(cool.supply.end)}, and days on market rose ${f.abs(cool.daysOnMarket.changePercent)} from ${f.int(cool.daysOnMarket.start)} to ${f.int(cool.daysOnMarket.end)} (highest ${f.int(cool.daysOnMarket.max.value)} in ${f.month(cool.daysOnMarket.max.month)}). The asking price fell ${f.abs(boomToCoolingAskingDrop)} from its peak to ${f.int(cool.asking.min.value)} (${f.month(cool.asking.min.month)}), and the sold price bottomed at ${f.int(cool.sold.min.value)} in ${f.month(cool.sold.min.month)}, ${f.abs(soldFromPeak)} below the ${f.month(boom.sold.max.month)} peak. The discount reached ${f.int(cool.discount.max.value)} DKK/m² in ${f.month(cool.discount.max.month)}. The timing resembles the 2022-23 rise in mortgage rates, but the snapshot has no interest rate data, so that link is context and not a finding.`,
      ),
    },
    "slow-high-supply": {
      title: L("Højt udbud og langsomme salg", "High supply and slow sales"),
      body: L(
        `Villaer til salg nåede periodens og datasættets højdepunkt på ${f.int(slow.supply.max.value)} i ${f.month(slow.supply.max.month)}, ${f.one(supplyPeakVsLow)} gange bunden på ${f.int(boom.supply.min.value)}. Salgstiden toppede på ${f.int(slow.daysOnMarket.max.value)} dage i ${f.month(slow.daysOnMarket.max.month)}${slowestSince ? `, det højeste siden ${f.month(slowestSince)}` : ""}. Priserne gik ingen steder: udbudsprisen endte ${f.percent(slow.asking.changePercent)} fra start og salgsprisen ${f.percent(slow.sold.changePercent)}. Det gennemsnitlige afslag var ${f.int(slow.discount.average)} kr./m², mod ${f.int(boom.discount.average)} i boom-perioden.`,
        `Villas for sale reached the peak of the whole snapshot at ${f.int(slow.supply.max.value)} in ${f.month(slow.supply.max.month)}, ${f.one(supplyPeakVsLow)} times the low of ${f.int(boom.supply.min.value)}. Days on market peaked at ${f.int(slow.daysOnMarket.max.value)} in ${f.month(slow.daysOnMarket.max.month)}${slowestSince ? `, the highest since ${f.month(slowestSince)}` : ""}. Prices went nowhere: the asking price ended ${f.percent(slow.asking.changePercent)} from where it started and the sold price ${f.percent(slow.sold.changePercent)}. The average discount was ${f.int(slow.discount.average)} DKK/m², against ${f.int(boom.discount.average)} in the boom phase.`,
      ),
    },
    "price-rebound": {
      title: L("Priserne stiger igen, men salgstiden følger ikke med", "Prices rise again, but days on market do not follow"),
      body: L(
        `Udbudsprisen steg ${f.abs(rebound.asking.changePercent)} til ${f.int(rebound.asking.end)}, og salgsprisen ${f.abs(rebound.sold.changePercent)} til ${f.int(rebound.sold.end)}.${jump ? ` Den største enkeltmåned var ${f.month(jump.month)} med ${f.percent(jump.changePercent)}. Uden transaktionstal kan det lige så vel være sammensætningen af de solgte boliger som et markedsskifte.` : ""} Villaer til salg faldt ${f.abs(rebound.supply.changePercent)} til ${f.int(rebound.supply.end)}. Salgstiden gik derimod op, til ${f.int(rebound.daysOnMarket.end)} dage. I tidligere faser fulgte faldende udbud og stigende priser normalt hurtigere salg, så det er den serie, der ikke følger med. Tag prisstigningen med forbehold, indtil salgstiden vender.`,
        `The asking price rose ${f.abs(rebound.asking.changePercent)} to ${f.int(rebound.asking.end)}, and the sold price ${f.abs(rebound.sold.changePercent)} to ${f.int(rebound.sold.end)}.${jump ? ` The largest single month was ${f.month(jump.month)} at ${f.percent(jump.changePercent)}. Without transaction counts, that could as easily be the mix of homes sold as a market shift.` : ""} Villas for sale fell ${f.abs(rebound.supply.changePercent)} to ${f.int(rebound.supply.end)}. Days on market rose instead, to ${f.int(rebound.daysOnMarket.end)}. In earlier phases falling supply and rising prices usually came with faster sales, so this is the series that does not follow. Treat the price rise with some caution until days on market turn.`,
      ),
    },
  };

  const keys: StatSeriesKey[] = ["sold", "asking", "supply", "daysOnMarket", "discount"];
  return summaries.map((summary, index) => ({
    id: summary.phase.id,
    number: index + 1,
    title: text[summary.phase.id].title,
    period: `${f.month(summary.phase.from)} - ${f.month(summary.phase.to)}`,
    body: text[summary.phase.id].body,
    changes: keys.map((key) => ({
      key,
      label: seriesLabel(key, language),
      percent: summary.metrics[key].changePercent,
      text: f.percent(summary.metrics[key].changePercent),
    })),
  }));
}

export interface RelationshipRemark {
  id: string;
  title: string;
  body: string;
  /** The numbers behind the remark, one line. */
  evidence: string;
  /** Null for remarks that are not about a correlation. */
  strength: CorrelationStrength | null;
}

/** The weaker of the monthly-change and the annual-average correlation, so one favourable number cannot carry the label. */
function conservativeStrength(monthly: number | null, annual: number | null): CorrelationStrength {
  const size = Math.min(Math.abs(monthly ?? 0), Math.abs(annual ?? 0));
  return correlationStrength(size);
}

export const STRENGTH_LABELS: Record<CorrelationStrength, { da: string; en: string }> = {
  negligible: { da: "Ubetydelig", en: "Negligible" },
  weak: { da: "Svag", en: "Weak" },
  moderate: { da: "Moderat", en: "Moderate" },
  strong: { da: "Stærk", en: "Strong" },
};

function findPair(list: PairCorrelation[], a: StatSeriesKey, b: StatSeriesKey): PairCorrelation {
  return list.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a))!;
}

function findLead(report: ZipMarketRelationships, leader: StatSeriesKey, follower: StatSeriesKey): LeadLagResult {
  return report.leadLag.find((l) => l.leader === leader && l.follower === follower)!;
}

export function buildRelationshipRemarks(language: Language, report: ZipMarketRelationships): RelationshipRemark[] {
  const f: StatsFormat = makeStatsFormat(language);
  const L = (da: string, en: string) => (language === "da" ? da : en);
  const months = (n: number) => {
    const size = Math.abs(n);
    return `${size} ${language === "da" ? (size === 1 ? "måned" : "måneder") : size === 1 ? "month" : "months"}`;
  };
  const vol = report.monthlyVolatility;

  const askSold = findLead(report, "asking", "sold");
  const supAsk = findLead(report, "supply", "asking");
  const supSold = findLead(report, "supply", "sold");
  const supTom = findLead(report, "supply", "daysOnMarket");
  const tomSold = findLead(report, "daysOnMarket", "sold");
  const discSold = findLead(report, "discount", "sold");
  const annual = report.annualCorrelations;
  const change = report.changeCorrelations;
  const halves = (l: LeadLagResult) => `${f.corr(l.halves?.first ?? null)} / ${f.corr(l.halves?.second ?? null)}`;
  const ratio = vol.asking && vol.sold ? vol.sold / vol.asking : null;

  return [
    {
      id: "asking-leads-sold",
      title: L(`Udbudsprisen går forud for salgsprisen med omkring ${months(askSold.best!.lag)}`, `The asking price leads the sold price by about ${months(askSold.best!.lag)}`),
      body: L(
        `Ændringer i udbudsprisen over 12 måneder hænger tydeligt sammen med ændringerne i salgsprisen, og sammenhængen er stærkest, når udbudsprisen får ${Math.abs(askSold.best!.lag)} måneders forspring. Det holder i begge halvdele af perioden. Modsat forudsiger salgsprisen ikke senere udbudspriser. En del af forspringet er statistisk, fordi udbudsprisen er en glat serie og salgsprisen en støjende. Brug det som en tendens, ikke som en månedlig prognose.`,
        `12-month changes in the asking price are clearly tied to changes in the sold price, and the link is strongest when the asking price gets a ${Math.abs(askSold.best!.lag)}-month head start. It holds in both halves of the history. The reverse does not: the sold price does not predict later asking prices. Part of the head start is statistical, because the asking series is smooth and the sold series is noisy. Use it as a tendency, not as a monthly forecast.`,
      ),
      evidence: L(
        `r = ${f.corr(askSold.sameMonth.r)} i samme måned, ${f.corr(askSold.best!.r)} ved ${months(askSold.best!.lag)}. Første / anden halvdel: ${halves(askSold)}. Årsgennemsnit: ${f.corr(findPair(annual, "asking", "sold").r)}.`,
        `r = ${f.corr(askSold.sameMonth.r)} in the same month, ${f.corr(askSold.best!.r)} at ${months(askSold.best!.lag)}. First / second half: ${halves(askSold)}. Annual averages: ${f.corr(findPair(annual, "asking", "sold").r)}.`,
      ),
      strength: conservativeStrength(askSold.best!.r, findPair(annual, "asking", "sold").r),
    },
    {
      id: "supply-vs-asking",
      title: L("Udbuddet er den stærkeste følgesvend til udbudsprisen", "Supply is the strongest companion of the asking price"),
      body: L(
        `Når antallet af villaer til salg vokser hurtigere end året før, vokser udbudsprisen langsommere eller falder. Når udbuddet skrumper, stiger priserne. Eksempler i data: udbuddet steg med over 40 % i 2017-19, mens udbudsprisen vendte, og udbuddet faldt til periodens bund i 2021-22, mens udbudsprisen satte rekord. Sammenhængen er den mest stabile i datasættet. Den viser ikke, hvad der er årsag, og en fælles drivkraft som renter kan stå bag begge dele.`,
        `When the number of villas for sale grows faster than a year earlier, the asking price grows more slowly or falls. When supply shrinks, prices rise. Examples in the data: supply rose by more than 40% in 2017-19 while the asking price turned, and supply fell to its low in 2021-22 while the asking price set records. This is the most stable relationship in the snapshot. It does not show which causes which, and a shared driver such as interest rates could sit behind both.`,
      ),
      evidence: L(
        `r = ${f.corr(supAsk.sameMonth.r)} i samme måned, ${f.corr(supAsk.best!.r)} ved ${months(supAsk.best!.lag)}. Første / anden halvdel: ${halves(supAsk)}. Årsgennemsnit: ${f.corr(findPair(annual, "supply", "asking").r)}.`,
        `r = ${f.corr(supAsk.sameMonth.r)} in the same month, ${f.corr(supAsk.best!.r)} at ${months(supAsk.best!.lag)}. First / second half: ${halves(supAsk)}. Annual averages: ${f.corr(findPair(annual, "supply", "asking").r)}.`,
      ),
      strength: conservativeStrength(supAsk.best!.r, findPair(annual, "supply", "asking").r),
    },
    {
      id: "supply-vs-sold",
      title: L("Udbuddet påvirker salgsprisen svagere og mindre stabilt", "Supply affects the sold price more weakly and less stably"),
      body: L(
        `Salgsprisen er også lavere, når udbuddet vokser, men sammenhængen er svagere end for udbudsprisen og ændrer sig over tid: i første halvdel er den næsten væk. Det passer med, at udbuddet virker via udbudsprisen, og at den månedlige salgspris er meget støjende.`,
        `The sold price is also lower when supply grows, but the link is weaker than for the asking price and changes over time: in the first half it is nearly gone. That fits supply working through the asking price, and the monthly sold price being very noisy.`,
      ),
      evidence: L(
        `r = ${f.corr(supSold.sameMonth.r)} i samme måned, ${f.corr(supSold.best!.r)} ved ${months(supSold.best!.lag)}. Første / anden halvdel: ${halves(supSold)}. Årsgennemsnit: ${f.corr(findPair(annual, "supply", "sold").r)}.`,
        `r = ${f.corr(supSold.sameMonth.r)} in the same month, ${f.corr(supSold.best!.r)} at ${months(supSold.best!.lag)}. First / second half: ${halves(supSold)}. Annual averages: ${f.corr(findPair(annual, "supply", "sold").r)}.`,
      ),
      strength: conservativeStrength(supSold.best!.r, findPair(annual, "supply", "sold").r),
    },
    {
      id: "supply-vs-days",
      title: L("Mere udbud giver længere salgstid", "More supply means longer days on market"),
      body: L(
        `Salgstiden stiger, når udbuddet vokser. Sammenhængen er tydeligst på årsniveau, og den er bred: den gælder mange måneder frem og er mest udtalt i anden halvdel af perioden. Det passer med, at salgstiden steg til 140-148 dage omkring årsskiftet 2024-25, da udbuddet toppede.`,
        `Days on market rise when supply grows. The link is clearest at the yearly level, and it is broad: it holds across many months ahead and is most pronounced in the second half of the history. It fits days on market rising to 140-148 around the turn of 2024-25, when supply peaked.`,
      ),
      evidence: L(
        `r = ${f.corr(supTom.sameMonth.r)} i samme måned. Første / anden halvdel (ved ${months(supTom.best!.lag)}): ${halves(supTom)}. Årsgennemsnit: ${f.corr(findPair(annual, "supply", "daysOnMarket").r)}.`,
        `r = ${f.corr(supTom.sameMonth.r)} in the same month. First / second half (at ${months(supTom.best!.lag)}): ${halves(supTom)}. Annual averages: ${f.corr(findPair(annual, "supply", "daysOnMarket").r)}.`,
      ),
      strength: conservativeStrength(supTom.best!.r, findPair(annual, "supply", "daysOnMarket").r),
    },
    {
      id: "days-vs-sold",
      title: L("Salgstid er et sent og støjende signal om priser", "Days on market is a late and noisy signal about prices"),
      body: L(
        `Kortere salgstid hænger sammen med stigende salgspriser, men sammenhængen er svag til moderat. Den stærkeste kobling er, at prisændringer kommer først og salgstiden følger omkring ${months(tomSold.best!.lag)} efter. Det er rimeligt, fordi en solgt bolig har stået til salg i flere måneder, før den tæller med. Brug derfor ikke salgstiden til at forudsige priser. Den seneste periode er et eksempel på, at de to kan gå hver sin vej.`,
        `Shorter days on market go with rising sold prices, but the link is weak to moderate. The strongest coupling is that price changes come first and days on market follow about ${months(tomSold.best!.lag)} later. That is plausible, because a sold home has been on the market for months before it counts. So do not use days on market to predict prices. The latest period is an example of the two going separate ways.`,
      ),
      evidence: L(
        `r = ${f.corr(tomSold.sameMonth.r)} i samme måned, ${f.corr(tomSold.best!.r)} når salgsprisen får ${Math.abs(tomSold.best!.lag)} måneders forspring. Årsgennemsnit: ${f.corr(findPair(annual, "sold", "daysOnMarket").r)}.`,
        `r = ${f.corr(tomSold.sameMonth.r)} in the same month, ${f.corr(tomSold.best!.r)} when the sold price leads by ${months(tomSold.best!.lag)}. Annual averages: ${f.corr(findPair(annual, "sold", "daysOnMarket").r)}.`,
      ),
      strength: conservativeStrength(tomSold.best!.r, findPair(annual, "sold", "daysOnMarket").r),
    },
    {
      id: "discount",
      title: L("Afslaget stiger med udbuddet og kan varsle svagere priser, men beviserne er løse", "The discount grows with supply and may warn of weaker prices, but the evidence is loose"),
      body: L(
        `Det gennemsnitlige afslag pr. m² er næsten uden sammenhæng med salgsprisens ændringer i samme måned. Til gengæld stiger det med udbuddet og følger udbudsprisens fald: det næsten fordobledes i 2017-19, da udbuddet voksede. Et større afslag har desuden gået forud for svagere salgspriser omkring ${months(discSold.best!.lag)} senere, men den sammenhæng varierer mellem de to halvdele af perioden og er den mindst pålidelige her. Definitionen af afslaget er ikke dokumenteret i kilden.`,
        `The average discount per m² has almost no link to sold price changes in the same month. It does grow with supply and follows falls in the asking price: it almost doubled in 2017-19 as supply grew. A larger discount has also come before weaker sold prices about ${months(discSold.best!.lag)} later, but that link varies between the two halves of the history and is the least reliable one here. The source does not document how the discount is defined.`,
      ),
      evidence: L(
        `Samme måned med salgspris: ${f.corr(discSold.sameMonth.r)}. Med udbudspris: ${f.corr(findPair(change, "asking", "discount").r)}. Med udbud: ${f.corr(findPair(change, "supply", "discount").r)}. Afslag før salgspris (${months(discSold.best!.lag)}): ${f.corr(discSold.best!.r)}, første / anden halvdel ${halves(discSold)}.`,
        `Same month with sold price: ${f.corr(discSold.sameMonth.r)}. With asking price: ${f.corr(findPair(change, "asking", "discount").r)}. With supply: ${f.corr(findPair(change, "supply", "discount").r)}. Discount before sold price (${months(discSold.best!.lag)}): ${f.corr(discSold.best!.r)}, first / second half ${halves(discSold)}.`,
      ),
      strength: conservativeStrength(discSold.best!.r, findPair(annual, "sold", "discount").r),
    },
    {
      id: "sold-is-noisy",
      title: L("Salgsprisen svinger langt mere fra måned til måned end udbudsprisen", "The sold price swings far more month to month than the asking price"),
      body: L(
        `Den typiske månedlige ændring i salgsprisen er ${ratio ? `${f.one(ratio)} gange` : "mange gange"} så stor som i udbudsprisen. Uden antal handler pr. måned kan enkeltmåneder derfor ikke bruges til at læse et markedsskifte. Sammenlign hellere 12-måneders gennemsnit eller ændringer fra samme måned sidste år.`,
        `The typical monthly change in the sold price is ${ratio ? `${f.one(ratio)} times` : "many times"} that of the asking price. Without the number of sales per month, single months cannot be used to read a market shift. Prefer 12-month averages or changes against the same month a year earlier.`,
      ),
      evidence: L(
        `Standardafvigelse af månedlige ændringer: salgspris ${f.one(vol.sold ?? 0)} procentpoint, udbudspris ${f.one(vol.asking ?? 0)}.`,
        `Standard deviation of monthly changes: sold price ${f.one(vol.sold ?? 0)} percentage points, asking price ${f.one(vol.asking ?? 0)}.`,
      ),
      strength: null,
    },
  ];
}

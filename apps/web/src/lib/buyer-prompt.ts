import { statSeries } from "@shared/analysis/zip-market-relationships";
import { zipMarketSnapshot } from "@shared/analysis/zip-market-stats";
import { latestVsTypical } from "@shared/analysis/zip-market-timing";
import type { Language } from "@/i18n/translations";
import { makeStatsFormat } from "@/lib/stats-format";
import { buildTimingView, capitalize, describeRuns, type MonthCategory } from "@/lib/zip-market-timing-view";

/**
 * Builds the text a buyer pastes into an AI assistant to find the best-value
 * home to buy. Pure: the statistics come from the postcode 9000 snapshot, and
 * the prompt only presents them as benchmarks when the search is in 9000.
 */

export interface BuyerPromptInput {
  /** Where to search, e.g. "boligsiden.dk". */
  source: string;
  /** Postcode and optionally city, e.g. "9000 Aalborg". */
  location: string;
  roomsMin: number | null;
  roomsMax: number | null;
  /** Minimum number of bathrooms/toilets. */
  bathroomsMin: number | null;
  minAreaM2: number | null;
}

export const EXAMPLE_INPUT: BuyerPromptInput = {
  source: "boligsiden.dk",
  location: "9000 Aalborg",
  roomsMin: 4,
  roomsMax: 5,
  bathroomsMin: 2,
  minAreaM2: 130,
};

/** The postcode the bundled statistics describe. */
export const BENCHMARK_ZIP = zipMarketSnapshot.source.locationName;

export function zipOf(location: string): string | null {
  return /^\s*(\d{4})\b/.exec(location)?.[1] ?? null;
}

/** Whole number >= 0, or null. Anything else, including NaN, becomes null. */
export function cleanCount(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

export function normalizeInput(input: BuyerPromptInput): BuyerPromptInput {
  let roomsMin = cleanCount(input.roomsMin);
  let roomsMax = cleanCount(input.roomsMax);
  if (roomsMin !== null && roomsMax !== null && roomsMax < roomsMin) [roomsMin, roomsMax] = [roomsMax, roomsMin];
  return {
    source: input.source.trim(),
    location: input.location.trim(),
    roomsMin,
    roomsMax,
    bathroomsMin: cleanCount(input.bathroomsMin),
    minAreaM2: cleanCount(input.minAreaM2),
  };
}

function roomsText(min: number | null, max: number | null, language: Language): string | null {
  if (min === null && max === null) return null;
  const unit = language === "da" ? "værelser" : "rooms";
  if (min !== null && max !== null) return min === max ? `${min} ${unit}` : `${min}-${max} ${unit}`;
  if (min !== null) return language === "da" ? `mindst ${min} ${unit}` : `at least ${min} ${unit}`;
  return language === "da" ? `højst ${max} ${unit}` : `at most ${max} ${unit}`;
}

const CATEGORY_TEXT: Record<Language, Record<MonthCategory, string>> = {
  da: {
    negotiate: "en måned, hvor køber har stor forhandlingsstyrke, men der er begrænset udvalg",
    balance: "en af årets bedste måneder: høj forhandlingsstyrke og normalt udbud",
    choice: "en måned med stort udvalg, men hurtige salg og små afslag",
    fast: "en hurtig måned med lidt forhandlingsrum",
    neutral: "en neutral måned uden tydeligt sæsonmønster",
  },
  en: {
    negotiate: "a month where buyers have strong negotiating power but choice is limited",
    balance: "one of the best months of the year: strong negotiating power and normal supply",
    choice: "a month with wide choice, but fast sales and small discounts",
    fast: "a fast month with little room to negotiate",
    neutral: "a neutral month with no clear seasonal pattern",
  },
};

/** The market-context lines for postcode 9000. Only call this when the search is in that postcode. */
function marketContext(language: Language, today: Date): string[] {
  const f = makeStatsFormat(language);
  const view = buildTimingView();
  const locale = language === "da" ? "da-DK" : "en-GB";
  const long = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" });
  const names = Array.from({ length: 12 }, (_, i) => long.format(new Date(Date.UTC(2025, i, 1))));
  const to = language === "da" ? "til" : "to";
  const and = language === "da" ? "og" : "and";
  const last = (key: "sold" | "asking" | "daysOnMarket" | "supply" | "discount") => {
    const points = statSeries(key);
    return points[points.length - 1]!;
  };
  const sold = last("sold");
  const asking = last("asking");
  const days = last("daysOnMarket");
  const supply = last("supply");
  const discount = last("discount");
  const typicalDays = latestVsTypical("daysOnMarket");
  const typicalDiscount = latestVsTypical("discount");
  const yoy = view.waiting.yearOverYearPercent;
  const month = f.month(sold.month);
  const nowCategory = view.categories[today.getUTCMonth()]!;
  // English capitalises month names, Danish does not.
  const nowName = language === "en" ? capitalize(names[today.getUTCMonth()]!) : names[today.getUTCMonth()]!;
  const leverage = describeRuns(view.leverageRuns, names, to, and);
  const choice = describeRuns(view.selectionRuns, names, to, and);

  if (language === "da") {
    return [
      `Markedsdata for postnummer ${BENCHMARK_ZIP} (seneste måned med tal: ${month}):`,
      `- Gennemsnitlig salgspris: ${f.int(sold.value)} kr./m² (${f.percent(yoy)} mod et år tidligere). Gennemsnitlig udbudspris for villaer: ${f.int(asking.value)} kr./m².`,
      `- Gennemsnitlig salgstid for solgte boliger: ${f.int(days.value)} dage${typicalDays ? ` (typisk ${f.int(typicalDays.typical)} dage for samme måned de seneste ${typicalDays.years} år)` : ""}.`,
      `- Gennemsnitligt afslag ved salg: ${f.int(discount.value)} kr./m²${typicalDiscount ? ` (typisk ${f.int(typicalDiscount.typical)} kr./m²)` : ""}. Villaer til salg: ${f.int(supply.value)}.`,
      `- Sæson: køber har mest forhandlingsstyrke ${leverage} og størst udvalg ${choice}. Nu er det ${nowName}: ${CATEGORY_TEXT.da[nowCategory]}.`,
      "- Forbehold: gennemsnit for hele postnummeret og blandede boligtyper. En enkelt bolig kan afvige meget. Sæsonmønstret handler om forhandlingsrum, ikke om en lavere pris i sig selv.",
    ];
  }
  return [
    `Market data for postcode ${BENCHMARK_ZIP} (latest month with figures: ${month}):`,
    `- Average sold price: ${f.int(sold.value)} DKK/m² (${f.percent(yoy)} versus a year earlier). Average asking price for villas: ${f.int(asking.value)} DKK/m².`,
    `- Average days on market for sold homes: ${f.int(days.value)}${typicalDays ? ` (typically ${f.int(typicalDays.typical)} for the same month over the last ${typicalDays.years} years)` : ""}.`,
    `- Average discount at sale: ${f.int(discount.value)} DKK/m²${typicalDiscount ? ` (typically ${f.int(typicalDiscount.typical)} DKK/m²)` : ""}. Villas for sale: ${f.int(supply.value)}.`,
    `- Season: buyers have the most negotiating power in ${leverage} and the widest choice in ${choice}. It is now ${nowName}: ${CATEGORY_TEXT.en[nowCategory]}.`,
    "- Caveats: averages for the whole postcode across mixed property types. A single home can differ a lot. The season is about negotiating room, not a lower price by itself.",
  ];
}

export function buildBuyerPrompt(rawInput: BuyerPromptInput, language: Language, today: Date = new Date()): string {
  const input = normalizeInput(rawInput);
  const da = language === "da";
  const zip = zipOf(input.location);
  const inBenchmarkArea = zip === BENCHMARK_ZIP;
  const rooms = roomsText(input.roomsMin, input.roomsMax, language);

  const source = input.source || (da ? "[angiv kilde]" : "[state a source]");
  const location = input.location || (da ? "[angiv postnummer]" : "[state a postcode]");

  const criteria: string[] = [
    da ? `- Område: ${location}` : `- Area: ${location}`,
    ...(rooms ? [da ? `- Værelser: ${rooms}` : `- Rooms: ${rooms}`] : []),
    ...(input.bathroomsMin !== null ? [da ? `- Badeværelser/toiletter: mindst ${input.bathroomsMin}` : `- Bathrooms/toilets: at least ${input.bathroomsMin}`] : []),
    ...(input.minAreaM2 !== null ? [da ? `- Boligareal: mindst ${input.minAreaM2} m²` : `- Living area: at least ${input.minAreaM2} m²`] : []),
  ];

  const context = inBenchmarkArea
    ? marketContext(language, today)
    : [
        da
          ? `Jeg har ingen markedstal for ${location}. Find selv områdets seneste gennemsnitlige salgspris pr. m², typiske salgstid og afslag fra solgte boliger, og oplys kilden. Brug ikke tal fra andre postnumre som om de gælder her.`
          : `I have no market figures for ${location}. Find the area's recent average sold price per m², typical days on market and discount from sold homes yourself, and give the source. Do not use figures from other postcodes as if they applied here.`,
      ];

  const dateText = today.toISOString().slice(0, 10);

  if (da) {
    return [
      `Du er en kritisk og nøgtern rådgiver for boligkøbere. Find de bedste og mest passende boliger til salg lige nu, med størst chance for et godt køb. Dags dato er ${dateText}.`,
      "",
      `Kilde: søg på ${source}. Brug kun sider, du lovligt kan tilgå, og omgå ikke adgangsbegrænsninger. Kan du ikke tilgå kilden, så sig det, i stedet for at gætte.`,
      "",
      "Mine krav (alle skal opfyldes):",
      ...criteria,
      "",
      ...context,
      "",
      "Sådan vurderer du en bolig, i denne rækkefølge:",
      "1. Opfylder den alle krav ovenfor? Ellers vises den ikke.",
      "2. Pris pr. m² mod områdets seneste salgspriser. Lavere er bedre, men tjek, om forskellen skyldes stand, beliggenhed eller fejl.",
      "3. Tid på markedet (liggetid) mod områdets gennemsnit. Lang liggetid giver forhandlingsrum, men find ud af hvorfor den ikke er solgt.",
      "4. Prisfald: oprindelig udbudspris mod nuværende, og hvor mange gange prisen er sat ned.",
      "5. Årstiden og min forhandlingsstyrke nu, jf. markedsdataene.",
      "6. Risici: energimærke, byggeår, tilstandsrapport, fugt, støj, oversvømmelse, grundforhold, dødsbo, vedligeholdelsesbehov.",
      "",
      "Svar sådan:",
      "- De 5 bedste boliger, rangeret. For hver: link, adresse, udbudspris, m², værelser, badeværelser, byggeår, dage på markedet, prisfald, pris pr. m² og afvigelsen fra områdets niveau.",
      "- En kort begrundelse for hver rangering og de vigtigste risici.",
      "- Et forslag til åbningsbud og øvre grænse for den bedste bolig, med begrundelse.",
      "- En kort samlet anbefaling: køb nu eller vent, set i forhold til årstiden.",
      "",
      "Regler: skriv 'ukendt', hvis en oplysning mangler, og gæt aldrig. Opfind ingen boliger, links eller tal. Angiv hvornår hver annonce sidst er set. Skeln mellem fakta fra annoncen og din egen vurdering. Det er ikke finansiel rådgivning, og jeg tjekker selv det hele før et bud.",
    ].join("\n");
  }
  return [
    `You are a critical, sober adviser for home buyers. Find the best and most suitable homes for sale right now, with the greatest chance of a good deal. Today's date is ${dateText}.`,
    "",
    `Source: search ${source}. Use only pages you can legitimately access and do not bypass access restrictions. If you cannot access the source, say so instead of guessing.`,
    "",
    "My requirements (all must be met):",
    ...criteria,
    "",
    ...context,
    "",
    "Assess each home in this order:",
    "1. Does it meet every requirement above? If not, leave it out.",
    "2. Price per m² against the area's recent sold prices. Lower is better, but check whether the gap comes from condition, location or defects.",
    "3. Days on market against the area average. A long time on market gives negotiating room, but find out why it has not sold.",
    "4. Price cuts: original asking price against current, and how many times the price has been reduced.",
    "5. The time of year and my negotiating power now, based on the market data.",
    "6. Risks: energy label, year built, condition report, damp, noise, flooding, ground conditions, estate sale, maintenance needs.",
    "",
    "Answer like this:",
    "- The 5 best homes, ranked. For each: link, address, asking price, m², rooms, bathrooms, year built, days on market, price cuts, price per m² and the difference from the area level.",
    "- A short reason for each ranking and the main risks.",
    "- A suggested opening bid and upper limit for the best home, with reasoning.",
    "- A short overall recommendation: buy now or wait, given the time of year.",
    "",
    "Rules: write 'unknown' when a detail is missing and never guess. Do not invent homes, links or figures. State when each listing was last seen. Separate facts from the listing from your own judgement. This is not financial advice, and I will check everything myself before bidding.",
  ].join("\n");
}

import type { PropertyType } from "../types/index.js";
import type { EvidenceStatus, ResearchAnalysisFilters, ResearchDataMode, ResearchTimeDefinition, ResearchTransaction } from "./types.js";
import { parseResearchDay } from "./history.js";
import { historicalReferencePrice, researchPriceFall } from "./prices.js";
import { RESEARCH_DAY_GROUPS, researchDays, researchDistribution, summarizeResearchTransactions } from "./statistics.js";

export const RESEARCH_PRICE_METHOD_VERSION = "matched-sale-price-reference/2.0";
export const RESEARCH_PRICE_MINIMUM_SALES = 1;

export interface ResearchPriceSubject {
  propertyId: string;
  unitId?: string | null;
  propertyType: PropertyType | null;
  municipality: string | null;
  residentialArea: number | null;
  areaEvidence: EvidenceStatus;
  dataMode: ResearchDataMode;
  firstAsking: number | null;
  /** True only for a documented first asking price in this listing campaign. */
  firstAskingDocumented: boolean;
  daysOnMarket: number | null;
  /** Dated source observation used directly for the current listing duration. */
  daysOnMarketSource?: { kind: "source_reported"; source: string; observedAt: string } | null;
  timeDefinition: ResearchTimeDefinition;
}

export interface ResearchPriceEstimateInput {
  subject: ResearchPriceSubject;
  transactions: ResearchTransaction[];
  excludedTransactionIds?: string[];
  dataVersion: string;
  calculatedAt: string;
  partialDataset?: boolean;
}

export interface ResearchPriceReference {
  status: "available" | "insufficient_data" | "unavailable";
  /** DKK implied by the subject's residential area, or by documented first asking for the secondary method. */
  median: number | null;
  q1: number | null;
  q3: number | null;
  count: number;
  propertyCount: number;
  transactionIds: string[];
}

export type ResearchPriceIssueCode =
  | "subject_not_live" | "subject_area_missing" | "subject_area_conflicting" | "subject_property_type_missing"
  | "subject_municipality_missing" | "invalid_calculated_at" | "subject_time_missing" | "insufficient_time_group_sales"
  | "subject_area_reported" | "thin_time_group_sample" | "thin_baseline_sample" | "thin_first_asking_sample"
  | "repeated_property_sales" | "partial_dataset" | "unmatched_condition" | "descriptive_time_group" | "historical_spread"
  | "missing_first_asking" | "insufficient_first_asking_pairs" | "insufficient_baseline_sales" | "historical_area_missing";

export interface ResearchPriceIssue {
  code: ResearchPriceIssueCode;
  message: string;
  messageEn: string;
}

export interface ResearchPriceExclusion {
  transactionId: string;
  code: "comparable_filter" | "subject_property" | "user_exclusion" | "area_not_at_sale" | "observation_after_calculation" | "time_group_mismatch";
  scope: "baseline" | "time_group";
  reason: string;
  reasonEn: string;
}

export interface ResearchPriceEstimate {
  status: "available" | "insufficient_data" | "missing_subject_data";
  primary: ResearchPriceReference;
  /** The same matching rules without a duration filter; never silently substituted for primary. */
  baseline: ResearchPriceReference;
  /** Separate method, never blended with price/m² or applied to today's asking price. */
  firstAskingReference: ResearchPriceReference & { medianTotalFallPercent: number | null };
  timeGroup: { label: string; min: number; max: number | null } | null;
  warnings: ResearchPriceIssue[];
  noDataReasons: ResearchPriceIssue[];
  excluded: ResearchPriceExclusion[];
  snapshot: {
    methodVersion: string;
    dataVersion: string;
    calculatedAt: string;
    subject: ResearchPriceSubject;
    filters: { baseline: ResearchAnalysisFilters; timeMatched: ResearchAnalysisFilters | null };
    minimumSales: number;
    areaTolerance: number;
    lookbackMonths: number;
    partialDataset: boolean;
    excludedTransactionIds: string[];
    /** Full immutable input preserves duplicate/conflict and exclusion decisions for replay. */
    sourceTransactions: ResearchTransaction[];
    primaryTransactionIds: string[];
    baselineTransactionIds: string[];
    firstAskingTransactionIds: string[];
  };
}

const positive = (value: number | null): value is number => value !== null && Number.isFinite(value) && value > 0;
const issue = (code: ResearchPriceIssueCode, message: string, messageEn: string): ResearchPriceIssue => ({ code, message, messageEn });
const countProperties = (rows: ResearchTransaction[]) => new Set(rows.map(row => row.propertyId)).size;

function emptyReference(status: ResearchPriceReference["status"] = "unavailable"): ResearchPriceReference {
  return { status, median: null, q1: null, q3: null, count: 0, propertyCount: 0, transactionIds: [] };
}

function priceReference(rows: ResearchTransaction[], prices: number[]): ResearchPriceReference {
  const distribution = researchDistribution(prices, rows.length);
  const available = rows.length >= RESEARCH_PRICE_MINIMUM_SALES;
  return {
    status: available ? "available" : "insufficient_data",
    median: available ? distribution.median : null,
    q1: available ? distribution.q1 : null,
    q3: available ? distribution.q3 : null,
    count: rows.length,
    propertyCount: countProperties(rows),
    transactionIds: rows.map(row => row.id),
  };
}

function twoYearsBefore(day: string): string {
  const source = new Date(`${day}T00:00:00Z`);
  const year = source.getUTCFullYear() - 2;
  const month = source.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(source.getUTCDate(), lastDay))).toISOString().slice(0, 10);
}

/**
 * Descriptive sales reference, not an appraisal or a prediction of seller acceptance.
 * Current asking and the buyer's private budget are deliberately absent from this API.
 */
export function estimateResearchPrice(input: ResearchPriceEstimateInput): ResearchPriceEstimate {
  const subject: ResearchPriceSubject = {
    propertyId: input.subject.propertyId, unitId: input.subject.unitId ?? null,
    propertyType: input.subject.propertyType, municipality: input.subject.municipality,
    residentialArea: input.subject.residentialArea, areaEvidence: input.subject.areaEvidence,
    dataMode: input.subject.dataMode, firstAsking: input.subject.firstAsking,
    firstAskingDocumented: input.subject.firstAskingDocumented,
    daysOnMarket: input.subject.daysOnMarket, timeDefinition: input.subject.timeDefinition,
    daysOnMarketSource: input.subject.daysOnMarketSource ? { ...input.subject.daysOnMarketSource } : null,
  };
  const warnings: ResearchPriceIssue[] = [
    issue("unmatched_condition", "Udvalget matcher boligtype, kommune og boligareal. Stand, grund, enhedstype og øvrige forhold er ikke fuldt matchet.", "The selection matches property type, municipality and residential area. Condition, land, unit type and other characteristics are not fully matched."),
    issue("descriptive_time_group", "Boligens nuværende liggetid sammenholdes med afsluttede handlers liggetid. Forskellen er beskrivende, ikke en effekt af ventetid eller en prognose for salgstid.", "The listing's elapsed time is compared with completed sales' durations. Differences are descriptive, not an effect of waiting or a forecast of time to sell."),
    issue("historical_spread", "Q1–Q3 viser de midterste 50 % af de historiske, arealtilpassede prisreferencer. Det er ikke et konfidensinterval, en vurdering eller sandsynligheden for sælgers accept.", "Q1–Q3 shows the middle 50% of historical, area-adjusted price references. It is not a confidence interval, appraisal or probability of seller acceptance."),
  ];
  const noDataReasons: ResearchPriceIssue[] = [];
  const excluded: ResearchPriceExclusion[] = [];
  const asOfDay = input.calculatedAt.slice(0, 10);
  const asOfStamp = parseResearchDay(asOfDay);
  const validCalculationDate = asOfStamp !== null && Number.isFinite(Date.parse(input.calculatedAt));
  const subjectAreaUsable = positive(subject.residentialArea) && (subject.areaEvidence === "verified" || subject.areaEvidence === "reported");
  if (subject.dataMode !== "live") noDataReasons.push(issue("subject_not_live", "Boligen mangler et reelt datagrundlag; demo- og ukendte kilder kan ikke få en prisreference.", "The property lacks a real data basis; demo and unknown sources cannot receive a price reference."));
  if (subject.areaEvidence === "conflicting") noDataReasons.push(issue("subject_area_conflicting", "Boligarealet er modstridende og skal afklares før en prisreference beregnes.", "Residential area is conflicting and must be resolved before calculating a price reference."));
  else if (!subjectAreaUsable) noDataReasons.push(issue("subject_area_missing", "Et positivt boligareal med oplyst eller kontrolleret grundlag mangler.", "A positive residential area with reported or verified evidence is missing."));
  if (!subject.propertyType) noDataReasons.push(issue("subject_property_type_missing", "Boligtypen mangler til udvælgelsen af sammenlignelige handler.", "Property type is missing for matching comparable sales."));
  if (!subject.municipality?.trim()) noDataReasons.push(issue("subject_municipality_missing", "Kommunen mangler til udvælgelsen af lokale handler.", "Municipality is missing for matching local sales."));
  if (!validCalculationDate) noDataReasons.push(issue("invalid_calculated_at", "Beregningsdatoen er ugyldig; salgsperioden kan ikke afgrænses.", "The calculation date is invalid; the sale period cannot be defined."));
  if (subject.areaEvidence === "reported") warnings.push(issue("subject_area_reported", "Boligens areal er oplyst, men ikke kontrolleret. Prisreferencen er betinget af dette areal.", "The subject area is reported but not verified. The price reference is conditional on this area."));
  if (input.partialDataset) warnings.push(issue("partial_dataset", "Datagrundlaget er et delvist udtræk. Referencerne beskriver kun de leverede handler, ikke hele markedet.", "The data is a partial extract. References describe only the supplied transactions, not the entire market."));

  const validTime = subject.daysOnMarket !== null && Number.isInteger(subject.daysOnMarket) && subject.daysOnMarket >= 0 &&
    (["active_days", "latest_episode_days", "calendar_days"] as string[]).includes(subject.timeDefinition);
  const foundGroup = validTime ? RESEARCH_DAY_GROUPS.find(group => subject.daysOnMarket! >= group.min && (group.max === null || subject.daysOnMarket! <= group.max)) : undefined;
  const timeGroup = foundGroup ? { ...foundGroup } : null;
  const baseSubjectComplete = noDataReasons.length === 0;
  if (!timeGroup) noDataReasons.push(issue("subject_time_missing", "Liggetid for den valgte tidsdefinition er ikke tilgængelig. Et særskilt sammenligningsgrundlag uden tidsfilter kan stadig vises.", "Time on market for the selected time definition is unavailable. A separate comparable-sales reference without time matching may still be shown."));

  const userExcluded = new Set(input.excludedTransactionIds ?? []);
  const subjectExcluded = new Set<string>();
  // Cascade exclusions across duplicate source IDs before the shared engine selects a source row.
  for (const row of input.transactions) {
    if (userExcluded.has(row.id) || userExcluded.has(row.transactionIdentity)) userExcluded.add(row.transactionIdentity);
    if (row.propertyId === subject.propertyId || (subject.unitId && row.unitId === subject.unitId)) {
      subjectExcluded.add(row.id);
      if (row.transactionIdentity.trim()) subjectExcluded.add(row.transactionIdentity);
    }
  }
  const exclusions = [...new Set([...userExcluded, ...subjectExcluded])].sort();
  const baselineFilters: ResearchAnalysisFilters = {
    propertyTypes: subject.propertyType ? [subject.propertyType] : [],
    municipality: subject.municipality?.trim() || undefined,
    minArea: subjectAreaUsable ? subject.residentialArea! * 0.75 : undefined,
    maxArea: subjectAreaUsable ? subject.residentialArea! * 1.25 : undefined,
    saleTypes: ["normal"], saleFrom: validCalculationDate ? twoYearsBefore(asOfDay) : undefined,
    saleTo: validCalculationDate ? asOfDay : undefined,
    timeDefinition: subject.timeDefinition, excludedTransactionIds: exclusions,
    dataVersion: input.dataVersion, calculatedAt: input.calculatedAt,
  };
  const timeFilters: ResearchAnalysisFilters | null = timeGroup ? { ...baselineFilters, minDays: timeGroup.min, maxDays: timeGroup.max ?? undefined } : null;
  let baseline = emptyReference();
  let primary = emptyReference();
  let firstAskingReference: ResearchPriceEstimate["firstAskingReference"] = { ...emptyReference(), medianTotalFallPercent: null };

  if (baseSubjectComplete) {
    // Run shared population rules and conflict-aware identity dedup before imposing area-at-sale.
    const population = summarizeResearchTransactions(input.transactions, baselineFilters);
    const byId = new Map(input.transactions.map(row => [row.id, row]));
    for (const entry of population.excluded) {
      const row = byId.get(entry.transactionId);
      const own = subjectExcluded.has(entry.transactionId) || (!!row && subjectExcluded.has(row.transactionIdentity));
      const manual = userExcluded.has(entry.transactionId) || (!!row && userExcluded.has(row.transactionIdentity));
      excluded.push({
        transactionId: entry.transactionId, code: own ? "subject_property" : manual ? "user_exclusion" : "comparable_filter", scope: "baseline",
        reason: own ? "Boligens egne tidligere handler eller samme boligenhed indgår ikke som sammenligninger." : manual ? "Handlen er fravalgt af brugeren, også på tværs af dubletkilder." : entry.reason,
        reasonEn: own ? "The subject property's own past sales or the same housing unit are excluded." : manual ? "The user excluded this transaction, including duplicate sources." : "Excluded by the live normal-sale, identity, source-conflict, date, location, type or area matching rules.",
      });
    }
    const baselineRows = population.transactions.filter(row => {
      if (!row.areaAtSale) {
        excluded.push({ transactionId: row.id, code: "area_not_at_sale", scope: "baseline", reason: "Boligarealet er ikke dokumenteret på salgstidspunktet.", reasonEn: "Residential area is not documented at the time of sale." });
        return false;
      }
      if (parseResearchDay(row.observedAt.slice(0, 10))! > asOfStamp!) {
        excluded.push({ transactionId: row.id, code: "observation_after_calculation", scope: "baseline", reason: "Handlen blev først observeret efter beregningsdatoen.", reasonEn: "The transaction was first observed after the calculation date." });
        return false;
      }
      return true;
    });
    const impliedPrices = (rows: ResearchTransaction[]) => rows.map(row => row.soldPrice! / row.residentialArea! * subject.residentialArea!);
    baseline = priceReference(baselineRows, impliedPrices(baselineRows));
    const primaryRows = timeGroup ? baselineRows.filter(row => {
      const days = researchDays(row, subject.timeDefinition);
      const matches = days !== null && days >= timeGroup.min && (timeGroup.max === null || days <= timeGroup.max);
      if (!matches) excluded.push({ transactionId: row.id, code: "time_group_mismatch", scope: "time_group", reason: "Liggetiden mangler eller ligger uden for boligens valgte tidsgruppe.", reasonEn: "The matching duration is missing or outside the subject's time group." });
      return matches;
    }) : [];
    if (timeGroup) primary = priceReference(primaryRows, impliedPrices(primaryRows));
    const pricePairRows = primaryRows.filter(row => researchPriceFall(row.firstAsking, row.soldPrice) !== null);
    const totalFall = researchDistribution(pricePairRows.map(row => researchPriceFall(row.firstAsking, row.soldPrice)), primaryRows.length);
    const documentedFirst = subject.firstAskingDocumented && positive(subject.firstAsking);
    const pairSampleSufficient = pricePairRows.length >= RESEARCH_PRICE_MINIMUM_SALES;
    firstAskingReference = {
      ...(documentedFirst && timeGroup ? priceReference(pricePairRows, pricePairRows.map(row => historicalReferencePrice(subject.firstAsking, researchPriceFall(row.firstAsking, row.soldPrice))!)) : {
        ...emptyReference(), count: pricePairRows.length, propertyCount: countProperties(pricePairRows), transactionIds: pricePairRows.map(row => row.id),
      }),
      medianTotalFallPercent: pairSampleSufficient ? totalFall.median : null,
    };
    if (!documentedFirst) warnings.push(issue("missing_first_asking", "En dokumenteret første udbudspris i det aktuelle forløb mangler. Historisk samlet prisfald anvendes ikke på dagens udbud.", "A documented first asking price in the current campaign is missing. Historical total price falls are not applied to today's asking price."));
    else if (!pairSampleSufficient) warnings.push(issue("insufficient_first_asking_pairs", "Ingen handler i tidsgruppen har dokumenterede første-/salgsprispar til den særskilte prisfaldsreference.", "No time-matched sales have documented first-asking/sale-price pairs for the separate price-fall reference."));
    else if (pricePairRows.length < 10) warnings.push(issue("thin_first_asking_sample", `Prisfaldsreferencen bygger på et spinkelt grundlag på ${pricePairRows.length} handler.`, `The price-fall reference uses a thin sample of ${pricePairRows.length} sales.`));
    if (timeGroup && primary.count < RESEARCH_PRICE_MINIMUM_SALES) noDataReasons.push(issue("insufficient_time_group_sales", "Ingen brugbare handler matcher boligen og tidsgruppen. Se det særskilte grundlag uden tidsfilter.", "No usable sales match the property and time group. See the separate reference without time matching."));
    else if (primary.count >= RESEARCH_PRICE_MINIMUM_SALES && primary.count < 10) warnings.push(issue("thin_time_group_sample", `Tidsgruppens prisreference bygger på et spinkelt grundlag på ${primary.count} handler.`, `The time-matched price reference uses a thin sample of ${primary.count} sales.`));
    if (baseline.count < RESEARCH_PRICE_MINIMUM_SALES) warnings.push(issue("insufficient_baseline_sales", "Udvalget uden tidsfilter har ingen brugbare handler.", "The selection without time matching has no usable sales."));
    else if (baseline.count < 10) warnings.push(issue("thin_baseline_sample", `Sammenligningen uden tidsfilter bygger på et spinkelt grundlag på ${baseline.count} handler.`, `The reference without time matching uses a thin sample of ${baseline.count} sales.`));
    if (baseline.propertyCount < baseline.count || primary.propertyCount < primary.count) warnings.push(issue("repeated_property_sales", "Flere handler vedrører samme ejendom. Antallet af handler er derfor større end antallet af forskellige ejendomme.", "Some transactions concern the same property. The transaction count therefore exceeds the number of distinct properties."));
    if (excluded.some(entry => entry.code === "area_not_at_sale")) warnings.push(issue("historical_area_missing", "Handler uden dokumenteret boligareal på salgstidspunktet er udeladt fra begge prisreferencer.", "Sales without documented residential area at the time of sale are excluded from both price references."));
  }

  return {
    status: !baseSubjectComplete || !timeGroup ? "missing_subject_data" : primary.status === "available" ? "available" : "insufficient_data",
    primary, baseline, firstAskingReference, timeGroup, warnings, noDataReasons, excluded,
    snapshot: {
      methodVersion: RESEARCH_PRICE_METHOD_VERSION, dataVersion: input.dataVersion, calculatedAt: input.calculatedAt,
      subject, filters: structuredClone({ baseline: baselineFilters, timeMatched: timeFilters }),
      minimumSales: RESEARCH_PRICE_MINIMUM_SALES, areaTolerance: 0.25, lookbackMonths: 24,
      partialDataset: input.partialDataset === true, excludedTransactionIds: [...(input.excludedTransactionIds ?? [])],
      sourceTransactions: structuredClone(input.transactions), primaryTransactionIds: [...primary.transactionIds],
      baselineTransactionIds: [...baseline.transactionIds], firstAskingTransactionIds: [...firstAskingReference.transactionIds],
    },
  };
}

import type { ResearchAnalysisFilters, ResearchAnalysisResult, ResearchDistribution, ResearchTransaction, ResearchTimeDefinition } from "./types.js";
import { researchPriceFall } from "./prices.js";
import { matchesStrictRenovation } from "./condition.js";
import { parseResearchDay } from "./history.js";

export const RESEARCH_ANALYSIS_VERSION = "research-statistics/1.0";
export const RESEARCH_DAY_GROUPS = [
  { label: "0–30", min: 0, max: 30 }, { label: "31–90", min: 31, max: 90 },
  { label: "91–180", min: 91, max: 180 }, { label: "181–365", min: 181, max: 365 },
  { label: "Over 365", min: 366, max: null },
] as const;

const positive = (value: number | null): value is number => value !== null && Number.isFinite(value) && value > 0;
export function researchDays(row: ResearchTransaction, definition: ResearchTimeDefinition): number | null {
  const value = definition === "active_days" ? row.activeDays : definition === "latest_episode_days" ? row.latestEpisodeDays : row.calendarDays;
  return value !== null && Number.isFinite(value) && value >= 0 && Number.isInteger(value) ? value : null;
}

/** Linear interpolation (R-7), deterministic for small samples, not a confidence interval. */
export function researchDistribution(values: (number | null)[], denominator: number): ResearchDistribution {
  const sorted = values.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  const quantile = (p: number) => {
    if (!sorted.length) return null;
    const position = (sorted.length - 1) * p;
    const lower = Math.floor(position);
    return sorted[lower]! + (sorted[Math.ceil(position)]! - sorted[lower]!) * (position - lower);
  };
  return {
    count: sorted.length, mean: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null,
    median: quantile(0.5), q1: quantile(0.25), q3: quantile(0.75),
    coverage: denominator > 0 ? sorted.length / denominator : 0,
  };
}

const usableArea = (row: ResearchTransaction) => row.areaDefinition === "residential" && positive(row.residentialArea) && row.areaEvidence !== "unknown" && row.areaEvidence !== "conflicting";
const historicalText = (row: ResearchTransaction) => !!row.condition?.text?.trim() && row.condition.historicalAssociation === "eligible";
const equalText = (a: string | null, b: string) => a?.trim().toLocaleLowerCase("da-DK") === b.trim().toLocaleLowerCase("da-DK");

const validCoordinate = (lon: number | null | undefined, lat: number | null | undefined): boolean =>
  typeof lon === "number" && Number.isFinite(lon) && lon >= -180 && lon <= 180 &&
  typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90;

/** Ray casting with inclusive boundaries, suitable for a user's local map selection. */
function pointInPolygon(lon: number, lat: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    const cross = (lon - xi) * (yj - yi) - (lat - yi) * (xj - xi);
    if (Math.abs(cross) < 1e-10 && lon >= Math.min(xi, xj) && lon <= Math.max(xi, xj) && lat >= Math.min(yi, yj) && lat <= Math.max(yi, yj)) return true;
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function exclusionReason(row: ResearchTransaction, filters: ResearchAnalysisFilters): string | null {
  if (row.dataMode !== "live") return "Demo eller utilgængelig kilde indgår ikke i produktionsstatistik.";
  if (row.status !== "sold") return "Igangværende og fjernede annoncer er ikke afsluttede handler.";
  if (!row.transactionIdentity.trim()) return "Handlen mangler en verificeret identitet.";
  if (!(filters.saleTypes ?? ["normal"]).includes(row.saleType!)) return "Handelstypen er ikke med i det valgte frihandelsgrundlag.";
  const saleDate = row.saleDate ? parseResearchDay(row.saleDate) : null;
  const observed = parseResearchDay(row.observedAt.slice(0, 10));
  const calculated = parseResearchDay(filters.calculatedAt.slice(0, 10));
  if (saleDate === null || observed === null || calculated === null || saleDate > observed || saleDate > calculated) return "Salgsdato mangler, er upræcis eller ligger efter observations-/beregningsdatoen.";
  if (!positive(row.soldPrice)) return "Dokumenteret positiv salgspris mangler.";
  if (filters.propertyTypes?.length && !filters.propertyTypes.includes(row.propertyType)) return "Boligtypen matcher ikke.";
  if (filters.municipality && !equalText(row.municipality, filters.municipality)) return "Kommunen matcher ikke.";
  if (filters.postalCode && !equalText(row.postalCode, filters.postalCode)) return "Postnummeret matcher ikke.";
  if (filters.street && !equalText(row.address.split(/\s+\d/)[0]?.split(",")[0] ?? null, filters.street)) return "Gaden matcher ikke.";
  if (filters.requireVerifiedArea && (!usableArea(row) || row.areaEvidence !== "verified")) return "Kontrolleret boligareal mangler til dokumentationsfiltret.";
  if ((filters.minArea !== undefined || filters.maxArea !== undefined) && !usableArea(row)) return "Dokumenteret boligareal mangler til arealfiltret.";
  if (filters.minArea !== undefined && row.residentialArea! < filters.minArea) return "Boligarealet er under minimum.";
  if (filters.maxArea !== undefined && row.residentialArea! > filters.maxArea) return "Boligarealet er over maksimum.";
  if (filters.minSoldPrice !== undefined && row.soldPrice < filters.minSoldPrice) return "Salgsprisen er under minimum.";
  if (filters.maxSoldPrice !== undefined && row.soldPrice > filters.maxSoldPrice) return "Salgsprisen er over maksimum.";
  if ((filters.minFirstAsking !== undefined || filters.maxFirstAsking !== undefined) && !positive(row.firstAsking)) return "Dokumenteret første udbudspris mangler til prisfiltret.";
  if (filters.minFirstAsking !== undefined && row.firstAsking! < filters.minFirstAsking) return "Første udbudspris er under minimum.";
  if (filters.maxFirstAsking !== undefined && row.firstAsking! > filters.maxFirstAsking) return "Første udbudspris er over maksimum.";
  if (filters.saleFrom && row.saleDate! < filters.saleFrom) return "Handlen er før den valgte periode.";
  if (filters.saleTo && row.saleDate! > filters.saleTo) return "Handlen er efter den valgte periode.";
  if (filters.saleMonth !== undefined && Number(row.saleDate!.slice(5, 7)) !== filters.saleMonth) return "Handlen er uden for den valgte måned.";
  const days = researchDays(row, filters.timeDefinition);
  if ((filters.minDays !== undefined || filters.maxDays !== undefined) && days === null) return "Gyldig liggetid med den valgte definition mangler.";
  if (filters.minDays !== undefined && days! < filters.minDays) return "Liggetiden er under minimum.";
  if (filters.maxDays !== undefined && days! > filters.maxDays) return "Liggetiden er over maksimum.";
  if (filters.strictRenovation && !matchesStrictRenovation(row.condition)) return "Handlen har ikke dokumenteret historisk behov/original stand i det stramme renoveringsudvalg.";
  if (filters.estateOnly && (!historicalText(row) || !row.condition!.signals.includes("estate"))) return "Historisk dødsbooplysning mangler; dødsbo er ikke i sig selv et standssignal.";
  if (filters.polygon || filters.bbox) {
    if (!validCoordinate(row.lon, row.lat)) return "Koordinater mangler til kortfiltret.";
    if (filters.bbox) {
      const [west, south, east, north] = filters.bbox;
      if (!validCoordinate(west, south) || !validCoordinate(east, north) || west > east || south > north) return "Kortudsnittets grænser er ugyldige.";
      if (row.lon! < west || row.lon! > east || row.lat! < south || row.lat! > north) return "Handlen ligger uden for det valgte kortudsnit.";
    }
    if (filters.polygon) {
      if (filters.polygon.length < 3 || filters.polygon.some(([lon, lat]) => !validCoordinate(lon, lat))) return "Det tegnede område er ugyldigt.";
      if (!pointInPolygon(row.lon!, row.lat!, filters.polygon)) return "Handlen ligger uden for det tegnede område.";
    }
  }
  if (filters.includedTransactionIds && !filters.includedTransactionIds.includes(row.id) && !filters.includedTransactionIds.includes(row.transactionIdentity)) return "Handlen er ikke valgt til arbejdsudvalget.";
  if (filters.excludedTransactionIds?.some((id) => id === row.id || id === row.transactionIdentity)) return "Handlen er manuelt fravalgt.";
  return null;
}

export function summarizeResearchTransactions(rows: ResearchTransaction[], filters: ResearchAnalysisFilters): ResearchAnalysisResult {
  const excluded: ResearchAnalysisResult["excluded"] = [];
  const candidates: ResearchTransaction[] = [];
  const duplicateGroups = new Map<string, ResearchTransaction[]>();
  for (const row of rows) {
    // Exclude unusable source populations before resolving duplicate sources.
    if (row.dataMode !== "live" || row.status !== "sold" || !row.transactionIdentity.trim()) {
      excluded.push({ transactionId: row.id, reason: exclusionReason(row, filters)! });
      continue;
    }
    const group = duplicateGroups.get(row.transactionIdentity) ?? [];
    group.push(row);
    duplicateGroups.set(row.transactionIdentity, group);
  }
  for (const group of duplicateGroups.values()) {
    // Do not silently choose a price or area from contradicting sources.
    const keys = ["propertyId", "unitId", "saleDate", "saleType", "soldPrice", "firstAsking", "lastAsking", "residentialArea", "areaDefinition", "activeDays", "latestEpisodeDays", "calendarDays"] as const;
    const conflicting = keys.some((key) => new Set(group.map((row) => row[key]).filter((value) => value !== null && value !== "unknown")).size > 1);
    if (conflicting) {
      for (const row of group) excluded.push({ transactionId: row.id, reason: "Modstridende kilder til samme handel skal afklares før statistik." });
      continue;
    }
    // Keep an actual coherent source row, preferring the most complete, then latest observed one.
    const completeness = (row: ResearchTransaction) => keys.reduce((sum, key) => sum + (row[key] === null ? 0 : 1), 0) + (historicalText(row) ? 1 : 0);
    const ordered = [...group].sort((a, b) => completeness(b) - completeness(a) || b.observedAt.localeCompare(a.observedAt) || a.id.localeCompare(b.id));
    const chosen = ordered[0]!;
    for (const duplicate of ordered.slice(1)) excluded.push({ transactionId: duplicate.id, reason: "Dublet af samme verificerede handel; tælles kun én gang." });
    const reason = exclusionReason(chosen, filters);
    if (reason) excluded.push({ transactionId: chosen.id, reason });
    else candidates.push(chosen);
  }
  const transactions = candidates.sort((a, b) => a.id.localeCompare(b.id));
  const totalFall = researchDistribution(transactions.map((row) => researchPriceFall(row.firstAsking, row.soldPrice)), transactions.length);
  const lastDiscount = researchDistribution(transactions.map((row) => researchPriceFall(row.lastAsking, row.soldPrice)), transactions.length);
  const pricePerResidentialSqm = researchDistribution(transactions.map((row) => usableArea(row) ? row.soldPrice! / row.residentialArea! : null), transactions.length);
  const groups = RESEARCH_DAY_GROUPS.map((group) => {
    const members = transactions.filter((row) => {
      const days = researchDays(row, filters.timeDefinition);
      return days !== null && days >= group.min && (group.max === null || days <= group.max);
    });
    return { ...group, transactionIds: members.map((row) => row.id), totalFall: researchDistribution(members.map((row) => researchPriceFall(row.firstAsking, row.soldPrice)), members.length) };
  });
  const warnings: string[] = [];
  if (totalFall.count < 5) warnings.push(`Meget lille grundlag: ${totalFall.count} handler med prispar. Det giver ikke en sikker prisreference eller generel renoveringsrabat.`);
  else if (totalFall.count < 20) warnings.push(`Lille grundlag: ${totalFall.count} handler med prispar. Fortolk fordelingen med forsigtighed.`);
  if (transactions.some((row) => usableArea(row) && !row.areaAtSale)) warnings.push("Nogle arealer er senere registertal; de er ikke dokumenteret som arealet på salgstidspunktet.");
  if (totalFall.coverage < 1) warnings.push("Det samlede prisfald dækker kun en del af det valgte udvalg.");
  warnings.push("Q1, median og Q3 beskriver historiske handler. De er ikke et konfidensinterval eller sandsynligheden for, at sælger accepterer et bud.");
  const filtersSnapshot: ResearchAnalysisFilters = { ...filters };
  if (filters.propertyTypes) filtersSnapshot.propertyTypes = [...filters.propertyTypes];
  if (filters.saleTypes) filtersSnapshot.saleTypes = [...filters.saleTypes];
  if (filters.includedTransactionIds) filtersSnapshot.includedTransactionIds = [...filters.includedTransactionIds];
  if (filters.excludedTransactionIds) filtersSnapshot.excludedTransactionIds = [...filters.excludedTransactionIds];
  if (filters.polygon) filtersSnapshot.polygon = filters.polygon.map(([lon, lat]) => [lon, lat]);
  if (filters.bbox) filtersSnapshot.bbox = [...filters.bbox];
  return {
    transactions, selectedCount: transactions.length, propertyCount: new Set(transactions.map((row) => row.propertyId)).size,
    totalFall, lastDiscount, pricePerResidentialSqm, groups, excluded, warnings,
    missing: {
      firstAsking: transactions.filter((row) => !positive(row.firstAsking)).length,
      lastAsking: transactions.filter((row) => !positive(row.lastAsking)).length,
      area: transactions.filter((row) => !usableArea(row)).length,
      text: transactions.filter((row) => !historicalText(row)).length,
      validDays: transactions.filter((row) => researchDays(row, filters.timeDefinition) === null).length,
    },
    snapshot: { dataVersion: filters.dataVersion, methodVersion: RESEARCH_ANALYSIS_VERSION, calculatedAt: filters.calculatedAt, filters: filtersSnapshot, transactionIds: transactions.map((row) => row.id) },
  };
}

import type {
  BuyingProject, BudgetItem, BudgetScenario, CriterionStatus, ProjectBudgetResult,
  PropertyResearchDecision, ResearchAssessment, ResearchCriterion, ResearchPropertyFacts,
} from "./types.js";

/** This is an opt-in private family profile, not a market-wide suitability rule. */
export function createBuyingProject(overrides: Partial<BuyingProject> = {}): BuyingProject {
  return {
    name: "Mit boligprojekt", totalBudget: 5_000_000, minResidentialArea: 130, minBedrooms: 3,
    acceptedPropertyTypes: [], primaryAreas: [], secondaryAreas: [], excludedAddresses: [],
    excludedRoads: [], excludedAreas: [], preferences: [], tracks: ["move_in_ready", "renovation"],
    ...overrides,
  };
}

export function createBudgetItem(id: string, label: string, category: BudgetItem["category"]): BudgetItem {
  return {
    id, label, category, low: null, high: null, vat: "unknown", vatRate: null,
    status: "assumption", source: "", observedAt: null, necessary: true, include: true, coveredByItemId: null,
  };
}

export function createPropertyAssessment(propertyId: string): ResearchAssessment {
  return {
    propertyId, legalBedrooms: null, bedroomEvidence: "unknown", bedroomSource: "",
    residentialArea: null, areaEvidence: "unknown", areaSource: "", hardRequirements: [],
    budgetItems: [
      createBudgetItem("transaction", "Handels- og finansieringsomkostninger", "transaction"),
      createBudgetItem("necessary-work", "Nødvendige arbejder før indflytning", "necessary_work"),
      createBudgetItem("reserve", "Reserve", "reserve"),
    ],
    selectedPurchasePrice: null, questions: [], notes: "", comparables: [], documents: [],
    brokerDraft: "", budgetScenario: "base",
  };
}

const validAmount = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 0;

export function calculateProjectBudget(totalBudget: number, items: BudgetItem[], purchasePrice: number | null): ProjectBudgetResult {
  const unknownItems: string[] = [];
  const warnings: string[] = [];
  let low = 0;
  let high = 0;
  const seen = new Set<string>();
  // An empty editor is not evidence that a purchase has no project costs.
  // Require an explicit necessary cost entry; an entered zero remains valid.
  if (!items.some((item) => item.include && item.necessary)) {
    unknownItems.push("project-costs");
    warnings.push("Projektomkostningerne er ikke afklaret. Tilføj mindst én nødvendig budgetpost med et udtrykkeligt beløb, også hvis beløbet er 0 kr.");
  }
  for (const item of items) {
    if (seen.has(item.id)) {
      unknownItems.push(item.id);
      warnings.push(`Budgetposten ${item.label} har et gentaget id og skal afklares.`);
      continue;
    }
    seen.add(item.id);
    if (!item.include) {
      if (item.necessary) {
        unknownItems.push(item.id);
        warnings.push(`Den nødvendige post ${item.label} er udeladt.`);
      }
      continue;
    }
    if (item.coveredByItemId) {
      const quote = items.find((candidate) => candidate.id === item.coveredByItemId);
      if (item.category === "reserve" && quote && quote.id !== item.id && quote.include &&
          quote.status === "quote" && quote.category !== "reserve" && !quote.coveredByItemId &&
          validAmount(quote.low) && (quote.high === null || validAmount(quote.high))) {
        warnings.push(`${item.label} er allerede med i tilbuddet ${quote.label} og lægges ikke til igen.`);
        continue;
      }
      unknownItems.push(item.id);
      warnings.push(`Dækningen af ${item.label} i et andet tilbud skal dokumenteres.`);
      continue;
    }
    const upper = item.high ?? item.low;
    if (!validAmount(item.low) || !validAmount(upper) || upper < item.low ||
        item.vat === "unknown" ||
        (item.vat === "excluded" && (item.vatRate === null || !Number.isFinite(item.vatRate) || item.vatRate < 0 || item.vatRate > 1))) {
      unknownItems.push(item.id);
      continue;
    }
    const factor = item.vat === "excluded" ? 1 + item.vatRate! : 1;
    low += item.low * factor;
    high += upper * factor;
  }
  const complete = unknownItems.length === 0 && validAmount(totalBudget);
  if (unknownItems.length) warnings.push("Ukendte poster er ikke 0 kr.; maksimal købspris kan først fastlægges, når de er afklaret.");
  if (!validAmount(totalBudget)) warnings.push("Projektloftet skal være et gyldigt beløb.");
  if (low !== high) warnings.push("Basis og belastning er et scenariointerval, ikke et statistisk konfidensinterval.");
  const scenario = (costs: number): BudgetScenario => ({
    costs,
    maxPurchasePrice: complete ? totalBudget - costs : null,
    projectTotal: complete && validAmount(purchasePrice) ? purchasePrice + costs : null,
    headroom: complete && validAmount(purchasePrice) ? totalBudget - purchasePrice - costs : null,
    complete,
  });
  return { base: scenario(low), stress: scenario(high), unknownItems: [...new Set(unknownItems)], warnings };
}

const normalized = (value: string) => value.trim().toLocaleLowerCase("da-DK").replace(/\s+/g, " ");
const matches = (values: string[], value: string | null | undefined) => !!value && values.some((entry) => normalized(entry) === normalized(value));

export function assessProperty(project: BuyingProject, facts: ResearchPropertyFacts, budget: BudgetScenario): PropertyResearchDecision {
  const criteria: ResearchCriterion[] = [];
  const add = (id: string, label: string, status: CriterionStatus, reason: string) => criteria.push({ id, label, status, reason, hard: true });
  const live = facts.dataMode === undefined || facts.dataMode === "live";
  const areaKnown = live && validAmount(facts.residentialArea) && facts.residentialArea > 0 && facts.areaEvidence !== "unknown" && facts.areaEvidence !== "conflicting";
  const areaVerified = areaKnown && facts.areaEvidence === "verified" && !!facts.areaSource?.trim();
  add("residential-area", "Lovligt boligareal", areaKnown && facts.residentialArea! < project.minResidentialArea ? "failed" : areaVerified ? "met" : "unknown",
    areaKnown && facts.residentialArea! < project.minResidentialArea ? `${facts.residentialArea} m² bolig opfylder ikke kravet på ${project.minResidentialArea} m². Kælder lægges ikke til.` :
      areaVerified ? `${facts.residentialArea} m² dokumenteret bolig. Kilde: ${facts.areaSource}` : "Boligareal og kilde skal dokumenteres. Kælder er ikke automatisk boligareal.");
  const bedroomsKnown = live && validAmount(facts.legalBedrooms) && facts.bedroomEvidence === "verified" && !!facts.bedroomSource?.trim();
  add("legal-bedrooms", "Lovligt anvendelige soveværelser", bedroomsKnown ? facts.legalBedrooms! >= project.minBedrooms ? "met" : "failed" : "unknown",
    bedroomsKnown ? `${facts.legalBedrooms} dokumenterede soveværelser; kravet er ${project.minBedrooms}. Kilde: ${facts.bedroomSource}` : "Annoncerede rum dokumenterer ikke antal lovligt anvendelige soveværelser.");
  if (project.acceptedPropertyTypes.length) add("property-type", "Boligtype",
    facts.propertyType === null ? "unknown" : project.acceptedPropertyTypes.includes(facts.propertyType) ? "met" : "failed",
    facts.propertyType === null ? "Boligtypen er ukendt." : project.acceptedPropertyTypes.includes(facts.propertyType) ? "Boligtypen er valgt i projektet." : "Boligtypen passer ikke til projektets ufravigelige krav.");
  const excluded = matches(project.excludedAddresses, facts.address) || matches(project.excludedRoads, facts.road) || matches(project.excludedAreas, facts.area);
  const incompleteExclusionCheck = (project.excludedRoads.length > 0 && !facts.road) || (project.excludedAreas.length > 0 && !facts.area);
  add("personal-exclusions", "Personlige fravalg", excluded ? "failed" : incompleteExclusionCheck ? "unknown" : "met",
    excluded ? "Boligen rammer et personligt fravalg. Det er ikke en offentlig påstand om området." : incompleteExclusionCheck ? "Vej eller område mangler til kontrol af dine personlige fravalg." : "Ingen af de kendte personlige fravalg rammer boligen.");
  criteria.push(...(facts.hardRequirements ?? []));
  const hard = criteria.filter((criterion) => criterion.hard);
  const suitability: CriterionStatus = hard.some((criterion) => criterion.status === "failed") ? "failed" : hard.some((criterion) => criterion.status === "unknown") ? "unknown" : "met";
  const documentation: CriterionStatus = hard.some((criterion) => criterion.status === "unknown") ? "unknown" : "met";
  const economy: CriterionStatus = !budget.complete || budget.headroom === null ? "unknown" : budget.headroom >= 0 ? "met" : "failed";
  if (suitability === "failed") return { criteria, suitability, documentation, economy, nextAction: "rejected", reason: hard.find((criterion) => criterion.status === "failed")!.reason };
  if (documentation === "unknown" || economy === "unknown") return { criteria, suitability, documentation, economy, nextAction: "clarify_documents", reason: documentation === "unknown" ? "Afgørende krav mangler dokumentation eller har modstridende oplysninger." : "Projektbudgettet mangler afklarede beløb eller et valgt prisniveau." };
  if (economy === "failed") return { criteria, suitability, documentation, economy, nextAction: "clarify_price", reason: "Boligen passer til de kendte krav, men den valgte samlede projektpris overstiger dit projektloft." };
  return { criteria, suitability, documentation, economy, nextAction: "viewing", reason: "De dokumenterede krav passer, og den valgte samlede projektpris holder sig inden for projektloftet." };
}

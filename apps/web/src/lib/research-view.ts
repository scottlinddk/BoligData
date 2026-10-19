import { assessProperty, calculateProjectBudget, createPropertyAssessment, type BuyingProject, type ResearchAssessment } from "@shared/analysis";
import type { Property } from "@shared/types/index";

export function researchDecision(project: BuyingProject, property: Property, assessment: ResearchAssessment) {
  const purchase = researchPurchasePrice(assessment.selectedPurchasePrice, property.price);
  const budget = calculateProjectBudget(project.totalBudget, assessment.budgetItems, purchase);
  const decision = assessProperty(project, {
    address: property.address,
    road: property.address.split(/\s+\d/)[0],
    area: property.municipality,
    propertyType: property.propertyType,
    residentialArea: assessment.residentialArea ?? property.sqm,
    areaEvidence: assessment.residentialArea === null ? "reported" : assessment.areaEvidence,
    areaSource: assessment.areaSource,
    legalBedrooms: assessment.legalBedrooms,
    bedroomEvidence: assessment.bedroomEvidence,
    bedroomSource: assessment.bedroomSource,
    hardRequirements: assessment.hardRequirements,
    dataMode: property.dataMode === "real" ? "live" : property.dataMode === "mock" || property.dataMode === "demo" ? "mock" : "unavailable",
  }, budget[assessment.budgetScenario]);
  if (decision.nextAction === "viewing" && purchase !== null && purchase < property.price) {
    return { budget, purchase, decision: { ...decision, nextAction: "clarify_price" as const, reason: "Den valgte økonomi forudsætter en købspris under udbuddet. Afklar prisniveauet før en fremvisning." } };
  }
  return { budget, decision, purchase };
}

/** Zero/missing listing prices are not free homes. Invalid explicit scenarios remain unknown. */
export function researchPurchasePrice(selectedPurchasePrice: number | null, askingPrice: number): number | null {
  const value = selectedPurchasePrice ?? askingPrice;
  return Number.isFinite(value) && value > 0 ? value : null;
}

export const newAssessment = (id: string) => createPropertyAssessment(id);

/** Draft generation deliberately accepts no ceiling, maximum bid, reserve, or financing data. */
export function brokerDraft(input: {
  address: string;
  kind: "first_contact" | "price" | "relisting" | "follow_up";
  dialoguePrice: number | null;
  includePrice: boolean;
  questions: string[];
  language: "da" | "en";
}): string {
  const da = input.language === "da";
  const intros = da ? {
    first_contact: "Vi er interesserede i boligen og vil gerne høre mere før en eventuel fremvisning.",
    price: "Vi er interesserede i boligen og vil gerne afklare prisniveauet før en fremvisning.",
    relisting: "Vi vil gerne forstå boligens udbudsforløb, herunder eventuelle pauser, genudbud og mæglerskift.",
    follow_up: "Tak for dialogen om boligen. Vi vil gerne følge op på de åbne spørgsmål.",
  } : {
    first_contact: "We are interested in the property and would like to learn more before arranging a viewing.",
    price: "We are interested in the property and would like to discuss the price level before a viewing.",
    relisting: "We would like to understand the listing history, including any pauses, relistings and changes of agent.",
    follow_up: "Thank you for discussing the property with us. We would like to follow up on the outstanding questions.",
  };
  const price = input.includePrice && input.dialoguePrice !== null && Number.isFinite(input.dialoguePrice) && input.dialoguePrice > 0
    ? (da ? `Er et prisniveau omkring ${input.dialoguePrice.toLocaleString("da-DK")} kr. relevant at drøfte?` : `Would a price level around DKK ${input.dialoguePrice.toLocaleString("en-GB")} be worth discussing?`)
    : "";
  return [da ? "Hej," : "Hello,", `${da ? "Vedrørende" : "Regarding"} ${input.address}.`, intros[input.kind], price,
    ...input.questions.map(q => `• ${q}`), da ? "Vi hører gerne, hvilke dokumenter I kan sende, og hvad et passende næste skridt vil være." : "Please let us know which documents you can provide and what the next step could be.",
    da ? "Venlig hilsen" : "Kind regards"].filter(Boolean).join("\n\n");
}

export function safeDocumentUrl(value: string): string | undefined {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}

export function downloadSnapshot(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

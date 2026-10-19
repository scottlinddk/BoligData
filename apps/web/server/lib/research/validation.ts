import type { BuyingProject, ResearchAssessment } from "../../../../../packages/shared/src/analysis/types.js";
import { isUuid } from "../http-helpers.js";

export class ResearchValidationError extends Error {}
export function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ResearchValidationError(`${label} skal være et objekt.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max = 2000): string {
  if (typeof value !== "string" || value.length > max) throw new ResearchValidationError(`${label} skal være tekst med højst ${max} tegn.`);
  return value;
}
function amount(value: unknown, label: string, nullable = false): number | null {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000_000) throw new ResearchValidationError(`${label} skal være et gyldigt, ikke-negativt tal.`);
  return value;
}
function choice<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (typeof value !== "string" || !choices.includes(value as T)) throw new ResearchValidationError(`${label} har en ugyldig værdi.`);
  return value as T;
}
function flag(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new ResearchValidationError(`${label} skal være sand eller falsk.`);
  return value;
}
function list<T>(value: unknown, label: string, map: (value: unknown) => T, max = 100): T[] {
  if (!Array.isArray(value) || value.length > max) throw new ResearchValidationError(`${label} skal være en liste med højst ${max} poster.`);
  return value.map(map);
}
function strings(value: unknown, label: string): string[] { return list(value, label, (v) => text(v, label, 500)); }
function date(value: unknown, label: string): string | null {
  if (value === null) return null;
  const str = text(value, label, 40);
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(str) || !Number.isFinite(Date.parse(str))) throw new ResearchValidationError(`${label} skal være en ISO-dato.`);
  return str;
}
function url(value: unknown): string {
  const str = text(value, "Dokumentlink", 2000);
  if (!str) return str;
  try { if (["http:", "https:"].includes(new URL(str).protocol)) return str; } catch { /* error below */ }
  throw new ResearchValidationError("Dokumentlinks skal bruge http eller https.");
}
const evidence = ["unknown", "reported", "verified", "conflicting"] as const;
const propertyTypes = ["villa", "apartment", "terraced_house", "summer_house", "farm", "villa_apartment", "cooperative", "holiday_plot", "residential_plot", "houseboat", "other"] as const;

export function validateProject(value: unknown): BuyingProject {
  const v = object(value, "Projekt");
  const totalBudget = amount(v.totalBudget, "Samlet projektloft")!;
  if (totalBudget <= 0) throw new ResearchValidationError("Samlet projektloft skal være større end 0.");
  const minBedrooms = amount(v.minBedrooms, "Soveværelser")!;
  if (!Number.isInteger(minBedrooms) || minBedrooms > 100) throw new ResearchValidationError("Antal soveværelser skal være et helt tal mellem 0 og 100.");
  return {
    name: text(v.name, "Projektnavn", 200), totalBudget,
    minResidentialArea: amount(v.minResidentialArea, "Boligareal")!, minBedrooms,
    acceptedPropertyTypes: list(v.acceptedPropertyTypes, "Boligtyper", (x) => choice(x, propertyTypes, "Boligtype")),
    primaryAreas: strings(v.primaryAreas, "Primære områder"), secondaryAreas: strings(v.secondaryAreas, "Sekundære områder"),
    excludedAddresses: strings(v.excludedAddresses, "Fravalgte adresser"), excludedRoads: strings(v.excludedRoads, "Fravalgte veje"),
    excludedAreas: strings(v.excludedAreas, "Fravalgte områder"), preferences: strings(v.preferences, "Præferencer"),
    tracks: list(v.tracks, "Købsspor", (x) => choice(x, ["move_in_ready", "renovation"], "Købsspor")),
  };
}

export function validateAssessment(value: unknown, propertyId: string): ResearchAssessment {
  const v = object(value, "Boligundersøgelse");
  if (!isUuid(propertyId) || v.propertyId !== propertyId) throw new ResearchValidationError("Bolig-id stemmer ikke overens.");
  const legalBedrooms = amount(v.legalBedrooms, "Dokumenterede soveværelser", true);
  if (legalBedrooms !== null && (!Number.isInteger(legalBedrooms) || legalBedrooms > 100)) throw new ResearchValidationError("Soveværelser skal være et helt tal mellem 0 og 100.");
  const budgetItems = list(v.budgetItems, "Budgetposter", (entry) => {
    const r = object(entry, "Budgetpost");
    const low = amount(r.low, "Lavt beløb", true), high = amount(r.high, "Højt beløb", true);
    if (low !== null && high !== null && high < low) throw new ResearchValidationError("Højt budgetbeløb må ikke være lavere end lavt beløb.");
    const vatRate = amount(r.vatRate, "Momssats", true);
    if (vatRate !== null && vatRate > 1) throw new ResearchValidationError("Momssats angives som en brøk mellem 0 og 1.");
    return { id: text(r.id, "Budget-id", 100), label: text(r.label, "Budgetnavn", 500),
      category: choice(r.category, ["transaction", "necessary_work", "improvement", "deferred_work", "advice", "relocation", "finance", "other", "reserve"], "Budgetkategori"),
      low, high, vat: choice(r.vat, ["included", "excluded", "not_applicable", "unknown"], "Moms"), vatRate,
      status: choice(r.status, ["assumption", "estimate", "quote"], "Budgetstatus"), source: text(r.source, "Budgetkilde"),
      observedAt: date(r.observedAt, "Budgetdato"), necessary: flag(r.necessary, "Nødvendig"), include: flag(r.include, "Medtag"),
      coveredByItemId: r.coveredByItemId === null ? null : text(r.coveredByItemId, "Dækket af", 100) };
  });
  if (new Set(budgetItems.map((x) => x.id)).size !== budgetItems.length) throw new ResearchValidationError("Budgetposter skal have entydige id'er.");
  for (const item of budgetItems) {
    if (item.coveredByItemId && (!budgetItems.some((x) => x.id === item.coveredByItemId) || item.coveredByItemId === item.id)) throw new ResearchValidationError("En dækket reserve skal henvise til en anden eksisterende budgetpost.");
  }
  return { propertyId, legalBedrooms, bedroomEvidence: choice(v.bedroomEvidence, evidence, "Soveværelseskilde"),
    bedroomSource: text(v.bedroomSource, "Soveværelsesdokumentation"), residentialArea: amount(v.residentialArea, "Boligareal", true),
    areaEvidence: choice(v.areaEvidence, evidence, "Arealstatus"), areaSource: text(v.areaSource, "Arealdokumentation"), budgetItems,
    hardRequirements: list(v.hardRequirements, "Krav", (entry) => { const r = object(entry, "Krav"); return {
      id: text(r.id, "Krav-id", 100), label: text(r.label, "Kravnavn", 500), status: choice(r.status, ["met", "failed", "unknown"], "Kravstatus"), reason: text(r.reason, "Begrundelse"), hard: flag(r.hard, "Ufravigeligt") }; }),
    selectedPurchasePrice: amount(v.selectedPurchasePrice, "Valgt prisniveau", true),
    questions: list(v.questions, "Spørgsmål", (entry) => { const r = object(entry, "Spørgsmål"); return { id: text(r.id, "Spørgsmåls-id", 100), text: text(r.text, "Spørgsmål"), resolved: flag(r.resolved, "Afklaret") }; }),
    notes: text(v.notes, "Noter", 20_000), brokerDraft: text(v.brokerDraft, "Mæglerudkast", 20_000),
    budgetScenario: choice(v.budgetScenario, ["base", "stress"], "Budgetscenario"),
    comparables: list(v.comparables, "Sammenligninger", (entry) => {
      const r = object(entry, "Sammenligning"); const included = flag(r.included, "Medtag"), reason = text(r.reason, "Begrundelse");
      if (!included && !reason.trim()) throw new ResearchValidationError("En udeladt sammenligning skal have en begrundelse.");
      return { transactionId: text(r.transactionId, "Handels-id", 200), included, reason };
    }, 500),
    documents: list(v.documents, "Dokumenter", (entry) => { const r = object(entry, "Dokument"); return {
      id: text(r.id, "Dokument-id", 100), title: text(r.title, "Dokumenttitel", 500), url: url(r.url),
      reference: text(r.reference, "Side eller afsnit", 500), classification: text(r.classification, "Klassifikation", 200), source: text(r.source, "Dokumentkilde"), observedAt: date(r.observedAt, "Dokumentdato"), status: choice(r.status, evidence, "Dokumentstatus") }; }),
  };
}

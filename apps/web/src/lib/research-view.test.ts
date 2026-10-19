import { describe, expect, it } from "vitest";
import { createBudgetItem, createBuyingProject, createPropertyAssessment, type ResearchAssessment } from "@shared/analysis";
import type { Property } from "@shared/types/index";
import { brokerDraft, researchDecision, researchPurchasePrice, safeDocumentUrl } from "./research-view";

const property = {
  id: "property-1", address: "Testvej 1, Aalborg", municipality: "Aalborg", propertyType: "villa",
  price: 4_000_000, sqm: 140, rooms: 4, dataMode: "real",
} as Property;

function verifiedAssessment(): ResearchAssessment {
  return {
    ...createPropertyAssessment(property.id), residentialArea: 140, areaEvidence: "verified", areaSource: "BBR bolig-enhed, side 2",
    legalBedrooms: 3, bedroomEvidence: "verified", bedroomSource: "Godkendt plantegning",
    budgetItems: [
      { ...createBudgetItem("fees", "Handel", "transaction"), low: 150_000, high: 150_000, vat: "included" },
      { ...createBudgetItem("work", "Arbejder", "necessary_work"), low: 650_000, high: 800_000, vat: "included" },
      { ...createBudgetItem("reserve", "Reserve", "reserve"), low: 200_000, high: 200_000, vat: "included" },
    ],
  };
}

describe("research decision adapter", () => {
  it("includes the entire project when the asking price alone fits", () => {
    const result = researchDecision(createBuyingProject(), { ...property, price: 4_900_000 }, verifiedAssessment());
    expect(result.budget.base.projectTotal).toBe(5_900_000);
    expect(result.decision.nextAction).toBe("clarify_price");
  });

  it("uses the selected base/stress scenario and leaves the input snapshot unchanged", () => {
    const assessment = verifiedAssessment();
    const before = JSON.stringify(assessment);
    expect(researchDecision(createBuyingProject(), property, assessment).decision.nextAction).toBe("viewing");
    expect(researchDecision(createBuyingProject(), property, { ...assessment, budgetScenario: "stress" }).decision.nextAction).toBe("clarify_price");
    expect(JSON.stringify(assessment)).toBe(before);
  });

  it("requires price dialogue when the affordable scenario assumes an unagreed reduction", () => {
    const assessment = { ...verifiedAssessment(), selectedPurchasePrice: 4_000_000 };
    const result = researchDecision(createBuyingProject(), { ...property, price: 4_300_000 }, assessment);
    expect(result.decision.economy).toBe("met");
    expect(result.decision.nextAction).toBe("clarify_price");
    const unknown = researchDecision(createBuyingProject(), { ...property, price: 4_300_000 }, { ...assessment, bedroomEvidence: "unknown" });
    expect(unknown.decision.nextAction).toBe("clarify_documents");
    const rejected = researchDecision(createBuyingProject(), { ...property, price: 4_300_000 }, { ...assessment, residentialArea: 116 });
    expect(rejected.decision.nextAction).toBe("rejected");
  });

  it("does not fabricate a zero purchase price for invalid or missing amounts", () => {
    for (const amount of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(researchPurchasePrice(null, amount)).toBeNull();
      expect(researchPurchasePrice(amount, 4_000_000)).toBeNull();
      const result = researchDecision(createBuyingProject(), { ...property, price: amount }, verifiedAssessment());
      expect(result.purchase).toBeNull();
      expect(result.budget.base.projectTotal).toBeNull();
      expect(result.decision.nextAction).toBe("clarify_documents");
    }
    expect(researchPurchasePrice(null, 4_000_000)).toBe(4_000_000);
    expect(researchPurchasePrice(3_500_000, 4_000_000)).toBe(3_500_000);
  });

  it.each(["mock", "demo", "unknown", undefined] as const)("cannot give %s property data a green decision", (dataMode) => {
    const result = researchDecision(createBuyingProject(), { ...property, dataMode }, verifiedAssessment());
    expect(result.decision.nextAction).toBe("clarify_documents");
    expect(result.decision.documentation).toBe("unknown");
  });

  it("preserves incomplete work as unknown and never derives legal bedrooms from rooms", () => {
    const assessment = createPropertyAssessment(property.id);
    const result = researchDecision(createBuyingProject(), property, assessment);
    expect(result.budget.base.maxPurchasePrice).toBeNull();
    expect(result.decision.criteria.find(c => c.id === "legal-bedrooms")?.status).toBe("unknown");
    expect(result.decision.nextAction).toBe("clarify_documents");
  });

  it("honors a road exclusion and a small residential area even when the purchase is cheap", () => {
    const profile = createBuyingProject({ excludedRoads: ["Testvej"] });
    expect(researchDecision(profile, property, verifiedAssessment()).decision.nextAction).toBe("rejected");
    const assessment = { ...verifiedAssessment(), residentialArea: null, areaEvidence: "unknown" as const };
    const result = researchDecision(createBuyingProject(), { ...property, price: 2_000_000, sqm: 116 }, assessment);
    expect(result.decision.nextAction).toBe("rejected");
  });
});

describe("private, editable broker drafts", () => {
  const input = { address: "Testvej 1", kind: "first_contact" as const, dialoguePrice: 4_000_000, includePrice: false, questions: ["Kan I sende den godkendte plantegning?"], language: "da" as const };

  it("omits the entered price without explicit sharing and adds no financing/timing/accepted-offer claims", () => {
    const text = brokerDraft(input);
    expect(text).toContain("Testvej 1");
    expect(text).toContain(input.questions[0]);
    expect(text).not.toContain("4.000.000");
    expect(text).not.toMatch(/projektloft|maksimumpris|reserve|finansiering|hurtig overtagelse|accepteret bud/i);
  });

  it("includes only a valid explicitly shared discussion price", () => {
    expect(brokerDraft({ ...input, includePrice: true })).toContain("4.000.000 kr.");
    for (const price of [null, 0, -10, Number.NaN]) {
      expect(brokerDraft({ ...input, includePrice: true, dialoguePrice: price })).not.toContain("prisniveau omkring");
    }
  });

  it("supports relisting and English follow-up drafts without sending or asserting acceptance", () => {
    expect(brokerDraft({ ...input, kind: "relisting" })).toContain("eventuelle pauser, genudbud");
    const text = brokerDraft({ ...input, language: "en", kind: "follow_up", questions: [] });
    expect(text).toContain("outstanding questions");
    expect(text).not.toMatch(/approved financing|quick takeover|accepted offer/i);
  });
});

describe("document links", () => {
  it("allows ordinary absolute web links and rejects script/file/data/credential-bearing links", () => {
    expect(safeDocumentUrl("https://example.dk/report.pdf?page=2")).toBe("https://example.dk/report.pdf?page=2");
    expect(safeDocumentUrl("http://example.dk/report.pdf")).toBe("http://example.dk/report.pdf");
    for (const input of ["javascript:alert(1)", "data:text/html,hi", "file:///C:/secret", "/relative", "https://user:pass@example.dk/report", "not a url"]) {
      expect(safeDocumentUrl(input)).toBeUndefined();
    }
  });
});

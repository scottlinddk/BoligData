import { describe, expect, it } from "vitest";
import {
  assessProperty, calculatePriceMetrics, calculateProjectBudget, calculateResearchTimeMetrics,
  classifyConditionEvidence, createBudgetItem, createBuyingProject, createPropertyAssessment,
  historicalReferencePrice, matchesStrictRenovation, researchDateBounds, researchDistribution,
  scenarioAskingCeiling, summarizeResearchTransactions, unionActiveDays,
  type BudgetItem, type ResearchActiveInterval, type ResearchAnalysisFilters,
  type ResearchPropertyFacts, type ResearchTransaction,
} from "@shared/analysis";

const item = (id: string, amount: number | null, category: BudgetItem["category"] = "necessary_work"): BudgetItem => ({
  ...createBudgetItem(id, id, category), low: amount, high: amount, vat: "included",
});
const family = createBuyingProject();
const verifiedFacts: ResearchPropertyFacts = {
  address: "Testvej 1", propertyType: "villa", residentialArea: 140, areaEvidence: "verified", areaSource: "BBR boligenhed",
  legalBedrooms: 3, bedroomEvidence: "verified", bedroomSource: "Godkendt plantegning", dataMode: "live",
};
const filters: ResearchAnalysisFilters = { timeDefinition: "active_days", dataVersion: "fixture/v1", calculatedAt: "2026-09-26T12:00:00Z" };
const transaction = (id: string, overrides: Partial<ResearchTransaction> = {}): ResearchTransaction => ({
  id, transactionIdentity: `sale-${id}`, propertyId: `property-${id}`, unitId: null, address: "Testvej 1",
  municipality: "Aalborg", postalCode: "9000", propertyType: "villa", saleType: "normal", saleDate: "2025-05-01",
  observedAt: "2026-09-20T12:00:00Z", firstAsking: 6_000_000, lastAsking: 5_500_000, soldPrice: 5_000_000,
  residentialArea: 140, areaDefinition: "residential", areaAtSale: true, areaEvidence: "verified",
  activeDays: 447, latestEpisodeDays: 91, calendarDays: 500, condition: null, dataMode: "live", status: "sold", source: "Fixture",
  ...overrides,
});
const condition = (text: string | null, extra = {}) => classifyConditionEvidence({
  text, source: "Arkiveret annonce", listingEpisodeId: "episode-1", observedAt: "2026-09-20", validAt: "2025-04-01", saleDate: "2025-05-01", ...extra,
});

describe("private project budget and decision acceptance", () => {
  it("initializes private requirements without inventing cost assumptions", () => {
    expect(family).toMatchObject({ totalBudget: 5_000_000, minResidentialArea: 130, minBedrooms: 3 });
    const assessment = createPropertyAssessment("test");
    const budget = calculateProjectBudget(family.totalBudget, assessment.budgetItems, 4_000_000);
    expect(budget.base.maxPurchasePrice).toBeNull();
    expect(budget.unknownItems).toHaveLength(3);
    expect(assessment).toMatchObject({ brokerDraft: "", documents: [], budgetScenario: "base" });
  });

  it("calculates the illustrative 5m - 150k - 650k - 200k fixture as a 4m purchase cap", () => {
    const budget = calculateProjectBudget(5_000_000, [item("costs", 150_000, "transaction"), item("work", 650_000), item("reserve", 200_000, "reserve")], 4_900_000);
    expect(budget.base).toEqual({ costs: 1_000_000, maxPurchasePrice: 4_000_000, projectTotal: 5_900_000, headroom: -900_000, complete: true });
    expect(assessProperty(family, verifiedFacts, budget.base).nextAction).toBe("clarify_price");
  });

  it("calculates explicit VAT/ranges and skips only a reserve included in a concrete quote", () => {
    const quote = { ...item("quote", 100_000), high: 120_000, vat: "excluded" as const, vatRate: 0.25, status: "quote" as const };
    const coveredReserve = { ...item("reserve", 20_000, "reserve"), coveredByItemId: "quote" };
    const budget = calculateProjectBudget(1_000_000, [quote, coveredReserve], 800_000);
    expect(budget.base.costs).toBe(125_000);
    expect(budget.stress.costs).toBe(150_000);
    expect(budget.stress.headroom).toBe(50_000);
    expect(budget.warnings.join(" ")).toContain("ikke et statistisk konfidensinterval");
    expect(calculateProjectBudget(1_000_000, [coveredReserve], 800_000).base.complete).toBe(false);
  });

  it("does not treat unknown required work, VAT, omitted work or hypothetical proceeds as zero", () => {
    for (const badItem of [item("unknown", null), { ...item("vat", 50_000), vat: "unknown" as const },
      { ...item("omitted", 50_000), include: false }, item("imagined-part-sale", -1_000_000)]) {
      const result = calculateProjectBudget(5_000_000, [badItem], 4_000_000);
      expect(result.base.maxPurchasePrice).toBeNull();
      expect(result.base.complete).toBe(false);
    }
  });

  it("keeps an empty or entirely optional budget incomplete while accepting explicit zero costs", () => {
    for (const items of [[], [{ ...item("optional", 0), necessary: false }], [{ ...item("excluded", 0), include: false, necessary: false }]]) {
      const result = calculateProjectBudget(5_000_000, items, 4_900_000);
      expect(result.base.complete).toBe(false);
      expect(result.base.maxPurchasePrice).toBeNull();
      expect(assessProperty(family, verifiedFacts, result.base).nextAction).toBe("clarify_documents");
    }
    const zeroCosts = calculateProjectBudget(5_000_000, [item("reviewed-project-costs", 0, "transaction")], 4_900_000);
    expect(zeroCosts.base).toMatchObject({ complete: true, costs: 0, maxPurchasePrice: 5_000_000, projectTotal: 4_900_000 });
    expect(assessProperty(family, verifiedFacts, zeroCosts.base).nextAction).toBe("viewing");
  });

  it("rejects 116 m² plus basement and a personal exclusion despite affordable price", () => {
    const budget = calculateProjectBudget(5_000_000, [item("reviewed-costs", 0)], 3_000_000).base;
    expect(assessProperty(family, { ...verifiedFacts, residentialArea: 116, basementArea: 80 }, budget).nextAction).toBe("rejected");
    const project = createBuyingProject({ excludedAddresses: [" testvej 1 "] });
    expect(assessProperty(project, verifiedFacts, budget).nextAction).toBe("rejected");
    expect(assessProperty(family, { ...verifiedFacts, hardRequirements: [{ id: "noise", label: "Støjkrav", hard: true, status: "failed", reason: "Personligt støjkrav er ikke opfyldt" }] }, budget).nextAction).toBe("rejected");
  });

  it("never substitutes four advertised rooms for three legal bedrooms or greens unknown sources", () => {
    const budget = calculateProjectBudget(5_000_000, [item("reviewed-costs", 0)], 3_000_000).base;
    expect(assessProperty(family, { ...verifiedFacts, legalBedrooms: null, bedroomEvidence: "unknown", advertisedRooms: 4 }, budget).nextAction).toBe("clarify_documents");
    expect(assessProperty(family, { ...verifiedFacts, areaSource: "" }, budget).nextAction).toBe("clarify_documents");
    expect(assessProperty(family, { ...verifiedFacts, dataMode: "mock" }, budget).nextAction).toBe("clarify_documents");
    expect(assessProperty(family, { ...verifiedFacts, areaEvidence: "conflicting" }, budget).nextAction).toBe("clarify_documents");
    expect(assessProperty(family, verifiedFacts, budget).nextAction).toBe("viewing");
  });

  it("keeps unknown critical evidence ahead of a price-only recommendation and recomputes profiles", () => {
    const budget = calculateProjectBudget(5_000_000, [item("reviewed-costs", 0)], 6_000_000).base;
    expect(assessProperty(family, { ...verifiedFacts, legalBedrooms: null }, budget).nextAction).toBe("clarify_documents");
    expect(assessProperty(createBuyingProject({ minResidentialArea: 150 }), verifiedFacts, budget).nextAction).toBe("rejected");
    expect(verifiedFacts.residentialArea).toBe(140);
  });
});

describe("separate signed price measures", () => {
  it("distinguishes 16.67% total decline from 9.09% last-price discount", () => {
    const metrics = calculatePriceMetrics({ firstAsking: 6_000_000, currentAsking: 5_500_000, lastAsking: 5_500_000, soldPrice: 5_000_000, targetPrice: 5_000_000 });
    expect(metrics.historicalTotalFallPercent).toBeCloseTo(16.6667, 4);
    expect(metrics.historicalLastDiscountPercent).toBeCloseTo(9.0909, 4);
    expect(metrics.additionalDiscountPercent).toBeCloseTo(9.0909, 4);
  });

  it("preserves negative historical declines and requires the appropriate source price", () => {
    const metrics = calculatePriceMetrics({ firstAsking: 4_000_000, currentAsking: 4_000_000, lastAsking: 4_000_000, soldPrice: 4_200_000, targetPrice: 4_500_000 });
    expect(metrics.historicalTotalFallPercent).toBe(-5);
    expect(metrics.additionalDiscountPercent).toBe(-12.5);
    expect(metrics.noDiscountRequired).toBe(true);
    const missing = calculatePriceMetrics({ firstAsking: null, currentAsking: 4_000_000, lastAsking: null, soldPrice: 3_800_000, targetPrice: 3_800_000 });
    expect(missing.historicalTotalFallPercent).toBeNull();
    expect(missing.totalRequiredFallPercent).toBeNull();
    expect(missing.historicalLastDiscountPercent).toBeNull();
    expect(historicalReferencePrice(null, 13)).toBeNull();
    expect(historicalReferencePrice(4_600_000, 13)).toBe(4_002_000);
    expect(scenarioAskingCeiling(4_000_000, 20)).toBe(5_000_000);
    expect(scenarioAskingCeiling(4_000_000, 100)).toBeNull();
  });
});

describe("documented listing time and date precision", () => {
  const interval = (start: string, end: string | null): ResearchActiveInterval => ({ start: { value: start, precision: "day" }, end: end ? { value: end, precision: "day" } : null, source: "Documented listing" });

  it("unions overlapping ads and excludes pauses", () => {
    const episodes = [interval("2025-01-01", "2025-01-11"), interval("2025-01-05", "2025-01-16"), interval("2025-02-01", "2025-02-06")];
    expect(unionActiveDays(episodes, "2025-03-01")).toBe(20);
    expect(unionActiveDays([], "2025-03-01")).toBeNull();
    expect(unionActiveDays([interval("2025-02-30", null)], "2025-03-01")).toBeNull();
  });

  it("keeps 447 active days separate from 91 latest episode days and technical first-seen", () => {
    const metrics = calculateResearchTimeMetrics({ intervals: [interval("2024-01-01", "2025-03-23")], asOf: "2025-03-23", latestEpisodeDays: 91, latestEpisodeDefinition: "Seneste mægler", firstDocumentedListing: { value: "2024-01-01", precision: "day" }, firstSeenAt: "2025-01-01" });
    expect(metrics.activeDays).toBe(447);
    expect(metrics.latestEpisodeDays).toBe(91);
    expect(metrics.calendarDays).toBe(447);
    expect(metrics.firstSeenAt).toBe("2025-01-01");
  });

  it("preserves monthly precision and never makes first_seen the first listing date", () => {
    expect(researchDateBounds({ value: "2024-02", precision: "month" })).toEqual({ earliest: "2024-02-01", latest: "2024-02-29" });
    expect(researchDateBounds({ value: "2024-13", precision: "month" })).toBeNull();
    const metrics = calculateResearchTimeMetrics({ intervals: [{ start: { value: "2025-01", precision: "month" }, end: null, source: "Arkiv" }], asOf: "2025-03-01", latestEpisodeDays: null, latestEpisodeDefinition: null, firstDocumentedListing: null, firstSeenAt: "2025-01-01" });
    expect(metrics.activeDays).toBeNull();
    expect(metrics.calendarDays).toBeNull();
    expect(metrics.firstDocumentedListing).toBeNull();
  });
});

describe("versioned condition evidence", () => {
  it.each([
    ["Kræver totalrenovering", ["needs_work"]],
    ["Totalrenoveret i 2023", ["completed_work"]],
    ["Ikke renoveret siden opførelsen", ["original_condition"]],
    ["Nyt køkken, men taget skal udskiftes", ["completed_work", "needs_work"]],
    ["Dødsbo", ["estate"]],
    ["Sæt eget præg", ["weak_potential"]],
    ["Kræver ikke renovering. Taget skal ikke udskiftes.", ["unknown"]],
    [null, ["unknown"]],
  ])("classifies %s as distinct simultaneous text clues", (text, signals) => {
    const evidence = condition(text as string | null);
    expect(evidence.signals.sort()).toEqual([...signals].sort());
    expect(evidence.methodVersion).toBeTruthy();
    expect(evidence.listingEpisodeId).toBe("episode-1");
    if (text && !signals.includes("unknown")) expect(evidence.excerpts.length).toBeGreaterThan(0);
  });

  it("does not apply later renovation descriptions to historical sales", () => {
    const evidence = condition("Kræver totalrenovering", { validAt: "2026-01-01" });
    expect(evidence.historicalAssociation).toBe("after_sale");
    expect(matchesStrictRenovation(evidence)).toBe(false);
    expect(matchesStrictRenovation(condition("Kræver totalrenovering"))).toBe(true);
    expect(matchesStrictRenovation(condition("Nyt køkken, men taget skal udskiftes"))).toBe(false);
    expect(matchesStrictRenovation(condition("Dødsbo"))).toBe(false);
  });
});

describe("auditable historical distributions", () => {
  it("keeps live normal completed trades separate from family, active, mock and future observations", () => {
    const rows = [transaction("normal"), transaction("family", { saleType: "family" }), transaction("active", { status: "active" }), transaction("mock", { dataMode: "mock" }), transaction("future", { saleDate: "2027-01-01" })];
    const result = summarizeResearchTransactions(rows, filters);
    expect(result.transactions.map((row) => row.id)).toEqual(["normal"]);
    expect(result.excluded).toHaveLength(4);
    expect(rows[1]!.saleType).toBe("family");
  });

  it("deduplicates by verified transaction identity, counts repeat sales, excludes source conflicts", () => {
    const original = transaction("a", { propertyId: "same-property" });
    const duplicate = { ...original, id: "b", source: "Second source" };
    const resale = transaction("c", { propertyId: "same-property", saleDate: "2026-01-01" });
    const result = summarizeResearchTransactions([original, duplicate, resale], filters);
    expect(result.selectedCount).toBe(2);
    expect(result.propertyCount).toBe(1);
    expect(result.excluded[0]!.reason).toContain("Dublet");
    expect(summarizeResearchTransactions([original, { ...duplicate, soldPrice: 9_000_000 }], filters).selectedCount).toBe(0);
    expect(summarizeResearchTransactions([original, { ...duplicate, unitId: "separate-unit", transactionIdentity: "unit-sale" }], filters).selectedCount).toBe(2);
  });

  it("reports per-measure missingness/coverage and filters real area rather than borrowing full-sample counts", () => {
    const rows = [transaction("valid"), transaction("missing", { firstAsking: null, residentialArea: null, activeDays: null }), transaction("small", { residentialArea: 116 })];
    const all = summarizeResearchTransactions(rows, filters);
    expect(all.totalFall.count).toBe(2);
    expect(all.totalFall.coverage).toBeCloseTo(2 / 3);
    expect(all.missing).toMatchObject({ firstAsking: 1, area: 1, validDays: 1, text: 3 });
    const large = summarizeResearchTransactions(rows, { ...filters, minArea: 130 });
    expect(large.selectedCount).toBe(1);
    expect(large.totalFall.count).toBe(1);
    expect(large.warnings.join(" ")).toContain("Meget lille grundlag");
    expect(large.snapshot).toMatchObject({ dataVersion: "fixture/v1", transactionIds: ["valid"] });
  });

  it("uses the selected time definition and exposes the actual rows behind five bins", () => {
    const rows = [transaction("a")];
    expect(summarizeResearchTransactions(rows, filters).groups[4]!.transactionIds).toEqual(["a"]);
    const latest = summarizeResearchTransactions(rows, { ...filters, timeDefinition: "latest_episode_days" });
    expect(latest.groups[2]!.transactionIds).toEqual(["a"]);
    expect(latest.groups[4]!.transactionIds).toEqual([]);
  });

  it("rejects weighted/missing areas, warns for one renovation reference, and preserves signed distributions", () => {
    const rows = [transaction("a", { condition: condition("Kræver totalrenovering"), soldPrice: 6_300_000 }),
      transaction("weighted", { areaDefinition: "weighted", condition: condition("Kræver totalrenovering") }),
      transaction("completed", { condition: condition("Totalrenoveret i 2023") })];
    const result = summarizeResearchTransactions(rows, { ...filters, minArea: 130, strictRenovation: true });
    expect(result.selectedCount).toBe(1);
    expect(result.totalFall.median).toBe(-5);
    expect(result.warnings.join(" ")).toContain("generel renoveringsrabat");
    expect(result.warnings.join(" ")).toContain("ikke et konfidensinterval");
    expect(researchDistribution([0, 10, 20, 30], 4)).toMatchObject({ q1: 7.5, median: 15, q3: 22.5, mean: 15 });
  });

  it("filters a map polygon including its boundary and excludes missing coordinates explicitly", () => {
    const polygon: [number, number][] = [[9, 56], [11, 56], [11, 58], [9, 58]];
    const result = summarizeResearchTransactions([
      transaction("inside", { lon: 10, lat: 57 }), transaction("edge", { lon: 9, lat: 57 }),
      transaction("outside", { lon: 12, lat: 57 }), transaction("unknown"),
    ], { ...filters, polygon });
    expect(result.transactions.map(row => row.id)).toEqual(["edge", "inside"]);
    expect(result.excluded.find(row => row.transactionId === "unknown")?.reason).toContain("Koordinater mangler");
    polygon[0]![0] = 0;
    expect(result.snapshot.filters.polygon?.[0]?.[0]).toBe(9);
  });

  it("applies map bounds, street, original asking-price and verified-area filters together", () => {
    const result = summarizeResearchTransactions([
      transaction("inside", { lon: 10, lat: 57 }), transaction("outside", { lon: 12, lat: 57 }),
      transaction("unverified", { lon: 10, lat: 57, areaEvidence: "reported" }),
      transaction("no-first", { lon: 10, lat: 57, firstAsking: null }),
      transaction("other-street", { lon: 10, lat: 57, address: "Andenvej 1" }),
    ], { ...filters, bbox: [9, 56, 11, 58], street: "testvej", minFirstAsking: 5_000_000, maxFirstAsking: 7_000_000, requireVerifiedArea: true });
    expect(result.transactions.map(row => row.id)).toEqual(["inside"]);
    expect(summarizeResearchTransactions([transaction("missing")], { ...filters, bbox: [9, 56, 11, 58] }).selectedCount).toBe(0);
  });

  it("keeps estate selection separate from condition and rejects text from a later sale period", () => {
    const rows = [transaction("estate", { condition: condition("Dødsbo") }),
      transaction("later", { condition: condition("Dødsbo", { validAt: "2026-01-01" }) }),
      transaction("renovation", { condition: condition("Kræver totalrenovering") })];
    expect(summarizeResearchTransactions(rows, { ...filters, estateOnly: true }).transactions.map(row => row.id)).toEqual(["estate"]);
    expect(summarizeResearchTransactions(rows, { ...filters, estateOnly: true, strictRenovation: true }).selectedCount).toBe(0);
  });
});

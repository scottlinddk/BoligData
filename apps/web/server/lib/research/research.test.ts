import { describe, expect, it } from "vitest";
import { createBuyingProject, createPropertyAssessment } from "../../../../../packages/shared/src/analysis/project.js";
import type { ResearchImportRequest } from "../../../../../packages/shared/src/types/research-api.js";
import { importIdentity, parseCsv, parseImportDate, previewImport, validateImportRequest } from "./import.js";
import { validateAssessment, validateProject } from "./validation.js";
import { projectFromRow, projectToRow, transactionFromRow } from "./handlers.js";

const propertyId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-09-26T12:00:00Z");
const makeImport = (rows: string, overrides: Partial<ResearchImportRequest> = {}): ResearchImportRequest => ({
  csv: `Bolig;Salg;Pris;Første;Sidste;Aktiv;Seneste;Type;Areal;Tekst\n${rows}`,
  mapping: { propertyId: "Bolig", soldDate: "Salg", salePrice: "Pris", firstAskingPrice: "Første", lastAskingPrice: "Sidste", documentedActiveDays: "Aktiv", latestEpisodeDays: "Seneste", saleType: "Type", residentialArea: "Areal", conditionText: "Tekst" },
  fileName: "Boligsalg.csv", sheetName: "Salg", sourceVersion: "2026-09-23", collectedAt: "2026-09-23T12:00:00Z", ...overrides,
});
describe("controlled import", () => {
  it("parses quoted separators, line breaks and doubled quotes without losing evidence", () => {
    expect(parseCsv('A;B\r\n1;"Nyt køkken; men taget\nkræver ""arbejde"""', ";")).toEqual([["A", "B"], ["1", 'Nyt køkken; men taget\nkræver "arbejde"']]);
    expect(() => parseCsv('A;B\n1;"not closed', ";")).toThrow("afsluttet");
  });
  it("keeps Danish prices, missing values and the 447/91 definitions separate", () => {
    const p = previewImport(makeImport(`${propertyId};2026-08-01;4.000.000;4.600.000,00;;447;91;normal;130;Kræver totalrenovering`), new Set([propertyId]));
    expect(p.counts.accepted).toBe(1);
    expect(p.rows[0]?.normalized).toMatchObject({ salePrice: 4_000_000, firstAskingPrice: 4_600_000, lastAskingPrice: null, documentedActiveDays: 447, latestEpisodeDays: 91, residentialArea: 130, areaDefinition: "unknown" });
    expect(p.reconciliation.actual.groups).toEqual([0, 0, 0, 0, 1]);
  });
  it("preserves month precision and rejects impossible dates", () => {
    expect(parseImportDate("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29", precision: "month" });
    expect(parseImportDate("2025-02-29")).toBeNull();
    expect(parseImportDate("23.09.2026")?.start).toBe("2026-09-23");
    const p = previewImport(makeImport(`${propertyId};2026-08;4000000;;;447;91;normal;;`), new Set([propertyId]));
    expect(p.rows[0]?.normalized).toMatchObject({ datePrecision: "month", soldDate: "2026-08-01", soldDateEnd: "2026-08-31" });
  });
  it("quarantines ambiguous identity and future sale dates without fuzzy address matching", () => {
    const p = previewImport(makeImport(`Næsten samme adresse;2026-08-01;4000000;;;;;normal;;\n${propertyId};2026-12-01;4000000;;;;;normal;;`), new Set([propertyId]));
    expect(p.counts.quarantined).toBe(2); expect(p.counts.accepted).toBe(0);
  });
  it("deduplicates both existing transactions and repeated spreadsheet rows", () => {
    const line = `${propertyId};2026-08-01;4000000;;;;;normal;;`;
    const p = previewImport(makeImport(`${line}\n${line}`), new Set([propertyId]));
    expect(p.counts).toMatchObject({ accepted: 1, duplicate: 1 });
    const existing = new Set([importIdentity({ propertyId, soldDate: "2026-08-01", salePrice: 4000000, saleType: "normal" })]);
    expect(previewImport(makeImport(line), new Set([propertyId]), existing).counts.duplicate).toBe(1);
    const monthLine = `${propertyId};2026-08;4000000;;;;;normal;;`;
    expect(previewImport(makeImport(monthLine), new Set([propertyId]), existing).counts.duplicate).toBe(0);
  });
  it("retains family sales but does not infer normal transfer when type is absent", () => {
    const p = previewImport(makeImport(`${propertyId};2026-08-01;4000000;;;;;family;;\n${propertyId};2025-08-01;3000000;;;;;;;`), new Set([propertyId]));
    expect(p.rows[0]?.normalized?.saleType).toBe("family");
    expect(p.rows[1]?.normalized?.saleType).toBe("unknown");
  });
  it("does not silently import older computed rankings or treat unlabelled data as real", () => {
    const request = validateImportRequest(makeImport(""), now);
    expect(request.dataMode).toBe("unknown");
    expect(() => validateImportRequest({ ...makeImport(""), mapping: { ...makeImport("").mapping, oldValuation: "Prisloft" } }, now)).toThrow("rangeringer");
    expect(() => validateImportRequest({ ...makeImport(""), collectedAt: "2027-01-01T00:00:00Z" }, now)).toThrow("fremtiden");
  });
  it("rejects invalid numbers, duplicate columns and unsafe source URLs", () => {
    const p = previewImport(makeImport(`${propertyId};2026-08-01;NaN;;;;;normal;;`), new Set([propertyId]));
    expect(p.rows[0]?.status).toBe("rejected");
    expect(() => previewImport(makeImport("", { csv: "Bolig;Bolig", mapping: { propertyId: "Bolig" } }), new Set())).toThrow("entydige");
    const q = previewImport(makeImport(`${propertyId};2026-08-01;4000000;normal;javascript:alert(1)`, { csv: `id;date;price;type;url\n${propertyId};2026-08-01;4000000;normal;javascript:alert(1)`, mapping: { propertyId: "id", soldDate: "date", salePrice: "price", saleType: "type", sourceUrl: "url" } }), new Set([propertyId]));
    expect(q.rows[0]?.status).toBe("rejected");
  });
});
describe("private project and assessment validation", () => {
  it("stores only allowlisted private project fields and preserves profile defaults", () => {
    const project = createBuyingProject();
    expect(validateProject({ ...project, owner_id: "another-user", role: "admin" })).toEqual(project);
    expect(projectFromRow(projectToRow(project, "owner"))).toEqual(project);
    expect(() => validateProject({ ...project, totalBudget: -1 })).toThrow();
  });
  it("validates complete assessment shapes, evidence links and per-property scope", () => {
    const assessment = createPropertyAssessment(propertyId);
    expect(validateAssessment(assessment, propertyId)).toEqual(assessment);
    expect(() => validateAssessment(assessment, "22222222-2222-4222-8222-222222222222")).toThrow("stemmer");
    expect(() => validateAssessment({ ...assessment, documents: [{ id: "x", title: "Doc", url: "javascript:alert(1)", reference: "1", classification: "manual", source: "x", observedAt: null, status: "reported" }] }, propertyId)).toThrow("http");
  });
  it("requires a reason for excluded comparables and valid cost intervals", () => {
    const assessment = createPropertyAssessment(propertyId);
    expect(() => validateAssessment({ ...assessment, comparables: [{ transactionId: "x", included: false, reason: "" }] }, propertyId)).toThrow("begrundelse");
    assessment.budgetItems[0]!.low = 100; assessment.budgetItems[0]!.high = 50;
    expect(() => validateAssessment(assessment, propertyId)).toThrow("lavere");
  });
});
describe("normalized history mapping", () => {
  const row = { id: "sale", property_id: propertyId, properties: { address: "Example", property_type: "villa" }, sold_date: "2026-08-01", sold_date_end: null, date_precision: "day", sale_price: 5000000, first_asking_price: 4600000, last_asking_price: 4300000, sale_type: "family", residential_area: 130, area_definition: "residential", area_as_of: "2026-09-01", documented_active_days: 447, latest_episode_days: 91, source: "user_import", observed_at: "2026-09-23T00:00:00Z", data_mode: "real" };
  it("keeps price evidence signed-ready, correct time definitions and later area provenance", () => {
    expect(transactionFromRow(row)).toMatchObject({ soldPrice: 5000000, firstAsking: 4600000, activeDays: 447, latestEpisodeDays: 91, saleType: "family", areaAtSale: false, dataMode: "live" });
  });
  it("does not invent exact days or turn mock/unknown provenance into production data", () => {
    expect(transactionFromRow({ ...row, date_precision: "month", data_mode: "unknown" })).toMatchObject({ saleDate: "2026-08", datePrecision: "month", dataMode: "unavailable" });
    expect(transactionFromRow({ ...row, data_mode: "mock" }).dataMode).toBe("mock");
  });
  it("groups conflicting prices on the same explicit unit/day for conflict detection", () => {
    expect(transactionFromRow(row).transactionIdentity).toBe(transactionFromRow({ ...row, id: "second-source", source: "registry", sale_price: 6000000 }).transactionIdentity);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SchoolDistrictResult } from "@shared/types/school-district";
import { SchoolDistrictContent } from "./school-district-panel";

const state = vi.hoisted(() => ({ language: "da" }));
vi.mock("@/i18n/i18n", () => ({ useI18n: () => state }));
vi.mock("@/hooks/use-school-district", () => ({ useSchoolDistrict: vi.fn() }));
const result: SchoolDistrictResult = {
  status: "available", reason: null, addressId: "0a3f509c-b58c-32b8-e044-0003ba298018", address: "Slåenvej 18, 9000 Aalborg",
  municipality: "Aalborg", matches: [{ schoolName: "Gl. Hasseris Skole", firstGrade: 0, lastGrade: 9, schoolUrl: "https://skoledistrikt.dk/skole/aalborg/gl-hasseris-skole" },
    { schoolName: "Overbygningsskole", firstGrade: 7, lastGrade: 10, schoolUrl: null }], confidence: "high", source: "CACHE",
  sourceUrl: "https://skoledistrikt.dk/api/school-district/by-address?id=0a3f509c-b58c-32b8-e044-0003ba298018",
  checkedAt: "2026-09-28T12:00:00.000Z", disclaimer: "Resultatet er vejledende.",
};
function render(overrides: Partial<Parameters<typeof SchoolDistrictContent>[0]> = {}, language = "da") {
  state.language = language;
  return renderToStaticMarkup(createElement(SchoolDistrictContent, { result, loading: false, failed: false, onRetry: () => {}, ...overrides }));
}

describe("school district panel", () => {
  it("renders all district schools, grade zero, attribution and source data", () => {
    const html = render();
    expect(html).toContain("Gl. Hasseris Skole"); expect(html).toContain("Overbygningsskole");
    expect(html).toContain("0.–9. klasse"); expect(html).toContain("7.–10. klasse");
    expect(html).toContain(result.sourceUrl); expect(html).toContain("GeoFA og LIFA AdresseService");
    expect(html).toContain("Kildens sikkerhed"); expect(html).toContain("CACHE"); expect(html).toContain(result.disclaimer);
  });

  it("renders English labels while retaining school names and the source's Danish disclaimer", () => {
    const html = render({}, "en");
    expect(html).toContain("School district"); expect(html).toContain("Grades 0–9");
    expect(html).toContain("Always confirm the school assignment with the municipality");
    expect(html).toContain('lang="da"');
  });

  it("separates loading, missing coverage and retryable source failure", () => {
    expect(render({ result: undefined, loading: true })).toContain("Henter skoledistrikt");
    const missing = render({ result: { ...result, status: "not_found", matches: [] } });
    expect(missing).toContain("Det betyder ikke"); expect(missing).not.toContain("Gl. Hasseris Skole");
    const failed = render({ result: { ...result, status: "unavailable", reason: "upstream_unavailable", matches: [] } });
    expect(failed).toContain("Prøv igen"); expect(failed).not.toContain("Se kildedata");
    expect(render({ result: undefined, failed: true })).toContain("kunne ikke hentes");
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CadastralReport } from "@shared/types/cadastral";
import { CadastralFacts } from "../components/cadastral-panel";
import { CadastralMap } from "../components/cadastral-map";
vi.mock("../hooks/use-cadastral", () => ({ useCadastral: vi.fn() }));
vi.mock("./supabase", () => ({ supabase: {} }));
const geometry = { polygons: [[[[552700, 6322100], [552750, 6322100], [552750, 6322150], [552700, 6322100]]]] } as CadastralReport["geometry"];
const report: CadastralReport = { status: "available", bfeNumber: "3299386", scope: "land_property", checkedAt: "2026-09-28T12:00:00Z", mapUrl: "https://www.matriklen.dk/kort/sfe/3299386", totalAreaSqm: 800, parcelsComplete: true, parcels: [], geometry, landUse: null, condominiumParent: false, commonLot: false, separateRoad: false, owners: { status: "unavailable", items: [], reason: "source_unavailable" } };
describe("cadastral presentation", () => {
  it.each(["da", "en"] as const)("shows official geometry, land scope and unavailable owner status (%s)", language => {
    const html = renderToStaticMarkup(createElement(CadastralFacts, { report, language }));
    expect(html).toContain("800 m²"); expect(html).toContain("3299386"); expect(html).toContain("<svg");
    expect(html).toContain(language === "da" ? "Ejeroplysninger er ikke tilgængelige" : "Owner information is currently unavailable");
    expect(html).toContain(language === "da" ? "matrikulære ejendom" : "cadastral land property");
  });
  it("does not display protected names even if passed unexpectedly to the UI", () => {
    const html = renderToStaticMarkup(createElement(CadastralFacts, { report: { ...report, owners: { status: "available", reason: null, items: [{ protected: true, name: "Must not appear", type: "BeskyttetPerson", companyNumber: null, actualShare: null, registeredShare: null, takeoverDate: null, registrationDate: null }] } }, language: "da" }));
    expect(html).not.toContain("Must not appear"); expect(html).toContain("Navne-/adressebeskyttelse");
  });
  it("falls back to the complete estate boundary if any parcel geometry is missing", () => {
    const p = { id: "1", number: "12ab", geometry } as CadastralReport["parcels"][number];
    const html = renderToStaticMarkup(createElement(CadastralMap, { report: { ...report, parcels: [p, { ...p, id: "2", number: "12ac", geometry: null }] }, language: "en" }));
    expect(html).toContain("BFE 3299386"); expect(html).not.toContain("12ab");
  });
  it("does not draw a partial map as if complete when no full estate boundary is available", () => {
    const p = { id: "1", number: "12ab", geometry } as CadastralReport["parcels"][number];
    const html = renderToStaticMarkup(createElement(CadastralMap, { report: { ...report, geometry: null, parcelsComplete: false, parcels: [p] }, language: "en" }));
    expect(html).toBe("");
  });
});

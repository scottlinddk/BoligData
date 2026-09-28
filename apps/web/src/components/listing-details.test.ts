import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ListingDetails, Property } from "@shared/types/index";
import { I18nProvider } from "@/i18n/i18n";
import { ListingFactsPanel, PropertyDescription } from "./listing-details";
import { BbrFactsPanel } from "./bbr-facts-panel";

const property = {
  id: "property", address: "Skytten 1A", dataMode: "real", listingSource: "boligsiden",
  sqm: 43, rooms: 2, buildingYear: null, description: "Bejsebakkekvarteret", listingUrl: null,
} as Property;
const details: ListingDetails = {
  source: "boligsiden", sourceUrl: "https://www.boligsiden.dk/adresse/skytten-1a-3-th-9000-aalborg",
  fetchedAt: "2026-09-28T12:00:00Z", title: "Lejlighed med vestvendt altan",
  description: "Mæglerens tekst om boligen.\nAndet afsnit.",
  facts: {
    yearBuilt: 1937, renovationYear: null, energyLabel: "C", areaSqm: 43,
    buildingType: null, floors: 3, roofMaterial: "Fibercement herunder asbest", wallMaterial: "Mursten",
    heatingInstallation: "Fjernvarme/blokvarme", basementSqm: null, toiletCount: 1,
    bathroomCount: 1, landAreaSqm: null, publicValuation: null,
  },
};
const render = (child: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(I18nProvider, null, child));

describe("property listing content", () => {
  it("shows source broker text and heading instead of the stale stored heading", () => {
    const html = render(createElement(PropertyDescription, { property, details }));
    expect(html).toContain("Mægler skriver");
    expect(html).toContain(details.title);
    expect(html).toContain(details.description);
    expect(html).not.toContain("Bejsebakkekvarteret");
    expect(html).toContain("Læs hele annoncen hos");
  });

  it("retains the stored description when the source is unavailable", () => {
    expect(render(createElement(PropertyDescription, { property, details: null }))).toContain(property.description);
  });

  it("renders remote descriptions as text, never executable markup", () => {
    const html = render(createElement(PropertyDescription, { property, details: { ...details, description: '<script>alert("unsafe")</script>' } }));
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("shows meaningful listing facts, source attribution and no rows of missing values", () => {
    const html = render(createElement(ListingFactsPanel, { property, details }));
    expect(html).toContain("Boligsiden");
    for (const value of ["1937", "Fibercement herunder asbest", "Mursten", "Fjernvarme/blokvarme"]) expect(html).toContain(value);
    expect(html).not.toContain("Grundareal");
    expect(html).not.toContain("Kælderareal");
    expect(html).not.toContain("BBR");
    expect(html).not.toContain("—");
  });

  it("preserves source-reported zero counts", () => {
    const html = render(createElement(ListingFactsPanel, { property, details: { ...details, facts: { ...details.facts, bathroomCount: 0 } } }));
    expect(html).toMatch(/Badeværelser<\/dt><dd[^>]*>0<\/dd>/);
  });

  it("shows known basic listing facts when supplemental data is unavailable", () => {
    const html = render(createElement(ListingFactsPanel, { property, details: null }));
    expect(html).toContain("43 m²");
    expect(html).toContain("Værelser");
    expect(html).not.toContain("Tagmateriale");
  });
});

describe("register facts rendering", () => {
  it("keeps cadastral facts visible even when BBR is unavailable", () => {
    const html = render(createElement(BbrFactsPanel, { bbrData: null, plotSqm: 800, matrikelnr: "1a" }));
    expect(html).toContain("800 m²");
    expect(html).toContain("1a");
    expect(html).not.toContain("ikke tilgængelige");
  });

  it("distinguishes loading from unavailable register data", () => {
    expect(render(createElement(BbrFactsPanel, { bbrData: null, plotSqm: null, loading: true }))).toContain("Henter BBR");
    const html = render(createElement(BbrFactsPanel, { bbrData: null, plotSqm: null }));
    expect(html).toContain("BBR-oplysninger er ikke tilgængelige");
    expect(html).not.toContain("Ingen berigelsesdata");
  });
});

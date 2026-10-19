import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Property } from "@shared/types/index";
import { I18nProvider } from "@/i18n/i18n";
import { ToastProvider } from "./toast";
import { PropertyCard } from "./property-card";
import { WorkspacePropertyPreview } from "./dashboard/workspace";

vi.mock("@/hooks/use-saved-properties", () => ({
  useSavedProperties: () => ({ isSaved: () => true, toggle: vi.fn() }),
}));

const property: Property = {
  id: "saved-property", address: "Hobrovej 79", municipality: "Aalborg", postalCode: "9000",
  status: "active", price: 3_000_000, sqm: 160, rooms: 5, images: [], riskFlags: null,
  listingSource: "boligsiden", listingDate: "2026-09-01", agentName: null,
  externalId: "case-1", lat: 57, lon: 9.9, buildingYear: 1930, propertyType: "villa",
  description: null, listingUrl: null,
  agentUserId: null, isPromoted: false, promotedAt: null, promotedBy: null,
  idLokalid: null, matrikelnr: null, ejerlav: null, zone: null, bfeNummer: null,
  registeredAreaSqm: null, bbrData: null, createdAt: "2026-09-01", updatedAt: "2026-10-02",
};

function render(Component: ComponentType<{ property: Property }>, status: Property["status"], language: "da" | "en") {
  vi.stubGlobal("window", { localStorage: { getItem: () => language } });
  return renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(I18nProvider, null, createElement(ToastProvider, null,
      createElement(Component, { property: { ...property, status } })))));
}

afterEach(() => vi.unstubAllGlobals());

describe("saved off-market properties", () => {
  it.each(["da", "en"] as const)("marks withdrawn favorites without claiming a sale (%s)", language => {
    const withdrawn = language === "da" ? "Fjernet fra markedet" : "Removed from market";
    const sold = language === "da" ? "Solgt" : "Sold";
    const lastPrice = language === "da" ? "Seneste udbudspris" : "Last asking price";
    for (const Component of [PropertyCard, WorkspacePropertyPreview]) {
      const html = render(Component, "withdrawn", language);
      expect(html).toContain(withdrawn);
      expect(html).toContain(lastPrice);
      expect(html).not.toContain(sold);
      expect(html).not.toContain("calendar days");
      expect(html).not.toContain("kalenderdage");
    }
  });

  it.each(["da", "en"] as const)("labels an explicit sale and keeps the amount an asking price (%s)", language => {
    for (const Component of [PropertyCard, WorkspacePropertyPreview]) {
      const html = render(Component, "sold", language);
      expect(html).toContain(language === "da" ? "Solgt" : "Sold");
      expect(html).toContain(language === "da" ? "Seneste udbudspris" : "Last asking price");
      expect(html).not.toContain("calendar days");
      expect(html).not.toContain("kalenderdage");
    }
  });

  it("retains elapsed listing days for active property cards", () => {
    const html = render(PropertyCard, "active", "en");
    expect(html).toContain("calendar days since reported start");
    expect(html).not.toContain("Last asking price");
    expect(html).not.toContain("Removed from market");
  });
});

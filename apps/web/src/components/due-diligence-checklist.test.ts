import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RiskFlags } from "@shared/types/index";
import { translations, type Language } from "@/i18n/translations";
import { DueDiligenceChecklist } from "./due-diligence-checklist";

const state = vi.hoisted(() => ({ language: "da" as Language }));
vi.mock("@/i18n/i18n", async () => {
  const { translations } = await import("@/i18n/translations");
  const t = (key: keyof typeof translations.da, vars?: Record<string, string | number>) =>
    Object.entries(vars ?? {}).reduce((text, [k, v]) => text.replace(`{${k}}`, String(v)), translations[state.language][key]);
  return { useI18n: () => ({ language: state.language, t }) };
});

const URL_AALBORG = "https://weblager.dk/public/municipality/851/45/search/all";
const flags: RiskFlags = {
  noiseExposureLden: null, encumbranceCheckRequired: true, encumbranceLookupUrl: null,
  sewerSeparationCheckRequired: true, sewerSeparationLookupUrl: null, buildingCaseArchiveUrl: null,
  oilTankRisk: false, oilTankRiskSource: "heuristic", soilContamination: { classification: "unknown", jordart: null },
  soilContaminationAttestUrl: null,
};
function render(riskFlags: RiskFlags | null, language: Language = "da") {
  state.language = language;
  return renderToStaticMarkup(createElement(DueDiligenceChecklist, { riskFlags }));
}

describe("due-diligence checklist building cases", () => {
  it("links to WebLager when a URL is set, in both languages", () => {
    const da = render({ ...flags, buildingCaseArchiveUrl: URL_AALBORG });
    expect(da).toContain(`href="${URL_AALBORG}"`);
    expect(da).toContain(translations.da["dueDiligence.buildingCases.label"]);
    const en = render({ ...flags, buildingCaseArchiveUrl: URL_AALBORG }, "en");
    expect(en).toContain(`href="${URL_AALBORG}"`);
    expect(en).toContain(translations.en["dueDiligence.buildingCases.label"]);
  });

  it("shows neutral text and no link when the URL is null", () => {
    const html = render(flags);
    expect(html).toContain(translations.da["dueDiligence.buildingCases.warning"]);
    expect(html).not.toContain("weblager.dk");
  });

  it("does not throw on older rows without the key", () => {
    const { buildingCaseArchiveUrl: _omitted, ...legacy } = flags;
    const html = render(legacy as RiskFlags);
    expect(html).toContain(translations.da["dueDiligence.buildingCases.warning"]);
  });

  it("lists the item as unknown-state when there are no risk flags", () => {
    expect(render(null)).toContain(translations.da["dueDiligence.buildingCases.label"]);
  });
});

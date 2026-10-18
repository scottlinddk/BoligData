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

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("due-diligence checklist without flags (nothing checked yet)", () => {
  it("names where each answer would come from instead of repeating 'no data' as the source", () => {
    const html = text(render(null));
    for (const key of ["noise", "encumbrance", "sewer", "buildingCases", "soil"] as const) {
      expect(html).toContain(translations.da[`dueDiligence.${key}.source`]);
    }
    expect(html).toContain(translations.da["dueDiligence.oilTank.source.bbr"]);
    expect(html).not.toContain(`Kilde: ${translations.da["dueDiligence.noData"]}`);
  });

  it("links the sources that have a public page", () => {
    const html = render(null);
    expect(html).toContain('href="https://miljoegis.mim.dk/spatialmap?profile=noise"');
    expect(html).toContain('href="https://arealinformation.miljoeportal.dk/"');
    expect(html).toContain('href="https://bbr.dk/"');
  });

  it("does not use internal jargon in either language", () => {
    for (const language of ["da", "en"] as const) {
      for (const [key, value] of Object.entries(translations[language])) {
        if (key.startsWith("dueDiligence.")) expect(value.toLowerCase(), key).not.toMatch(/berigelse|enrichment/);
      }
    }
  });
});

describe("due-diligence checklist oil tank", () => {
  const oil = (overrides: Partial<RiskFlags>) => text(render({ ...flags, ...overrides }));

  it("says BBR records oil heating, not that the building's age suggests a tank, when the warning comes from BBR", () => {
    const html = oil({ oilTankRisk: true, oilTankRiskSource: "bbr" });
    expect(html).toContain(translations.da["dueDiligence.oilTank.warning.bbr"]);
    expect(html).not.toContain(translations.da["dueDiligence.oilTank.warning"]);
  });

  it("keeps the age wording for the building-year heuristic", () => {
    expect(oil({ oilTankRisk: true, oilTankRiskSource: "heuristic" })).toContain(translations.da["dueDiligence.oilTank.warning"]);
  });

  it("says why it is unknown, and labels BBR as the source rather than a heuristic that was never used", () => {
    const html = oil({ oilTankRisk: false, oilTankRiskSource: "heuristic" });
    expect(html).toContain(translations.da["dueDiligence.oilTank.unknown"]);
    expect(html).toContain(translations.da["dueDiligence.oilTank.source.bbr"]);
    expect(html).not.toContain(translations.da["dueDiligence.oilTank.source.heuristic"]);
  });

  it("reports a BBR heating that is not oil as no risk indicated", () => {
    expect(oil({ oilTankRisk: false, oilTankRiskSource: "bbr" })).toContain(translations.da["dueDiligence.oilTank.ok"]);
  });

  it("explains a missing noise reading instead of repeating 'not checked'", () => {
    expect(text(render(flags))).toContain(translations.da["dueDiligence.noise.none"]);
    expect(text(render({ ...flags, noiseExposureLden: 52 }))).toContain("Lden 52 dB");
  });
});


describe("due-diligence checklist with live register answers", () => {
  it("shows a mapped noise band with its source, and no mapped zone as a clear answer", () => {
    const loud = text(render({ ...flags, noiseChecked: true, noiseBand: { lowerDb: 60, upperDb: 64, source: "roads_in_towns" } }));
    expect(loud).toContain("Kortlagt støj 60–64 dB (Lden) fra veje i byen.");
    const top = text(render({ ...flags, noiseChecked: true, noiseBand: { lowerDb: 75, upperDb: null, source: "major_rail" } }, "en"));
    expect(top).toContain("Mapped noise above 75 dB (Lden) from major railways.");
    const quiet = render({ ...flags, noiseChecked: true });
    expect(text(quiet)).toContain(translations.da["dueDiligence.noise.clear"]);
    expect(quiet).toContain("✓");
  });

  it("names BBR's heating behind an oil tank answer, and says when the fuel is not recorded", () => {
    expect(text(render({ ...flags, oilTankRiskSource: "bbr", heatingInstallation: "fjernvarme" }))).toContain("BBR registrerer fjernvarme som opvarmning, ikke oliefyr.");
    expect(text(render({ ...flags, heatingInstallation: "centralvarme" }))).toContain("BBR registrerer centralvarme, men ikke brændslet");
  });

  it("names the contamination register's site and links its attest", () => {
    const attest = "https://jord.miljoeportal.dk/report/?elav=2005051&matrnr=327b";
    const html = render({ ...flags, soilContamination: { classification: "v1", jordart: null }, soilContaminationAttestUrl: attest, soilContaminationSiteName: "Tidligere autoværksted" });
    expect(text(html)).toContain("(V1). Lokalitet: Tidligere autoværksted.");
    expect(html).toContain(`href="${attest.replace(/&/g, "&amp;")}"`);
  });

  it("always links the land register, since no source answers the tingbogsattest", () => {
    expect(render(flags)).toContain('href="https://www.tinglysning.dk/"');
  });
});

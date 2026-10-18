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
function render(riskFlags: RiskFlags | null, language: Language = "da", askingPriceDkk: number | null = null) {
  state.language = language;
  return renderToStaticMarkup(createElement(DueDiligenceChecklist, { riskFlags, askingPriceDkk }));
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

describe("due-diligence checklist: BBR tanks", () => {
  const tank = {
    sizeLiters: 1500, manufacturedYear: 1978, installedYear: 1978, decommissionDeadline: "2028-12-31", decommissionedYear: null,
    decommissioned: false, inOperation: true, placementCode: null, contentCode: null,
  };
  const withTanks = (tanks: RiskFlags["oilTanks"], overrides: Partial<RiskFlags> = {}) => render({ ...flags, oilTankRisk: true, oilTankRiskSource: "bbr", heatingInstallation: "fjernvarme", oilTanks: tanks, ...overrides });

  it("names the registered tank with its size, make year and deadline, and drops the heating line next to it", () => {
    const html = text(withTanks({ tanks: [tank] }));
    expect(html).toContain("BBR registrerer en tank, der ikke er meldt sløjfet: 1.500 l, fabrikeret 1978, frist for sløjfning 2028-12-31.");
    expect(html).not.toContain("ikke oliefyr");
    expect(html).toContain(translations.da["dueDiligence.oilTank.source.tanks"]);
    expect(withTanks({ tanks: [tank] })).toContain("!");
  });

  it("says when the deadline has passed, and counts several tanks", () => {
    const html = text(withTanks({ tanks: [{ ...tank, decommissionDeadline: "2020-01-01" }, { ...tank, sizeLiters: null, manufacturedYear: null, decommissionDeadline: null }] }));
    expect(html).toContain("BBR registrerer 2 tanke, der ikke er meldt sløjfet:");
    expect(html).toContain("størrelse ikke oplyst");
    expect(html).toContain(translations.da["dueDiligence.oilTank.tank.overdue"]);
  });

  it("keeps the heating answer and adds that a decommissioned tank was registered", () => {
    const html = text(render({ ...flags, oilTankRiskSource: "bbr", heatingInstallation: "fjernvarme", oilTanks: { tanks: [{ ...tank, decommissioned: true, decommissionedYear: 2014 }] } }));
    expect(html).toContain("BBR registrerer fjernvarme som opvarmning, ikke oliefyr.");
    expect(html).toContain("BBR registrerer 1 sløjfet tank.");
  });

  it("says plainly that none is registered, in English too", () => {
    expect(text(render({ ...flags, oilTankRiskSource: "bbr", heatingInstallation: "fjernvarme", oilTanks: { tanks: [] } }, "en"))).toContain("No tank is registered in BBR.");
  });

  it("leaves older rows without the tank register as they were", () => {
    const html = text(render({ ...flags, oilTankRiskSource: "bbr", heatingInstallation: "fjernvarme" }));
    expect(html).not.toContain(translations.da["dueDiligence.oilTank.tank.none"]);
    expect(html).toContain(translations.da["dueDiligence.oilTank.source.bbr"]);
  });
});

describe("due-diligence checklist: land from the cadastre", () => {
  const land = {
    totalAreaSqm: 812, parcelCount: 1, forestReserve: null, beachProtection: null, duneProtection: null,
    entailedForest: false, agriculturalNote: null, commonLot: false, condominiumParent: false,
  };

  it("shows each restriction with its area, as a warning", () => {
    const html = render({ ...flags, landRegistration: { ...land, forestReserve: { areaSqm: 3000 }, duneProtection: { areaSqm: 20 }, agriculturalNote: "Landbrug" } });
    expect(text(html)).toContain("Fredskov på 3.000 m². Klitfredning på 20 m². Noteret som landbrugsejendom (Landbrug), og dermed med landbrugspligt.");
    expect(html).toContain("!");
  });

  it("says nothing is registered, with the registered area, when the land is unrestricted", () => {
    const html = text(render({ ...flags, landRegistration: land }));
    expect(html).toContain(`${translations.da["dueDiligence.land.clear"]} Registreret grundareal: 812 m².`);
  });

  it("says it could not be looked up when MAT was not asked, never that the land is clear", () => {
    const html = text(render(flags));
    expect(html).toContain(translations.da["dueDiligence.land.unknown"]);
    expect(html).not.toContain(translations.da["dueDiligence.land.clear"]);
  });

  it("lists the item in English", () => {
    expect(text(render({ ...flags, landRegistration: { ...land, beachProtection: { areaSqm: 40 } } }, "en"))).toContain("Beach protection on 40 m².");
  });
});

describe("due-diligence checklist: public valuation", () => {
  const valuation = { year: 2024, propertyValueDkk: 3_000_000, landValueDkk: 800_000, previousYear: 2022, previousPropertyValueDkk: 2_500_000 };

  it("shows the value, the land value and the change since the year before", () => {
    const html = text(render({ ...flags, valuation }));
    expect(html).toMatch(/2024: ejendomsværdi 3\.000\.000\s*kr\., heraf grundværdi 800\.000\s*kr\./);
    expect(html).toContain("+20 % siden 2022.");
  });

  it("compares the asking price with the valuation when the price is known", () => {
    expect(text(render({ ...flags, valuation }, "da", 3_600_000))).toContain("Udbudsprisen ligger 20 % over vurderingen.");
    expect(text(render({ ...flags, valuation }, "da", 2_400_000))).toContain("Udbudsprisen ligger 20 % under vurderingen.");
    expect(text(render({ ...flags, valuation }, "en", 3_000_000))).toContain("The asking price matches the valuation.");
    expect(text(render({ ...flags, valuation }))).not.toContain("Udbudsprisen");
  });

  it("says none was found when VUR gave no valuation, and never treats a valuation as a risk", () => {
    expect(text(render(flags))).toContain(translations.da["dueDiligence.valuation.unknown"]);
    expect(render({ ...flags, valuation })).toContain("✓");
  });
});

describe("due-diligence checklist: every new text exists in both languages", () => {
  it("has a Danish and an English text for each new key", () => {
    const keys = Object.keys(translations.da).filter((key) => /^dueDiligence\.(land|valuation|oilTank\.tank)|oilTank\.source\.tanks|^register\.source\.(land|oilTanks)|deduction\.(landProtection|farmland|oilTankOverdue)/.test(key));
    expect(keys.length).toBeGreaterThan(25);
    for (const key of keys) {
      expect(translations.en[key as keyof typeof translations.en], key).toBeTruthy();
    }
  });
});

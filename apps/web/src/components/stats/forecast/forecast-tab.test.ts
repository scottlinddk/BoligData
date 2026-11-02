import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "@/i18n/i18n";
import { ForecastTab } from "./forecast-tab";
import { TimingFindings } from "../timing-findings";
import { buildTimingFindings } from "@/lib/zip-market-findings";

const render = (component: Parameters<typeof createElement>[0]) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(I18nProvider, null, createElement(component))));

describe("ForecastTab", () => {
  const html = render(ForecastTab);

  it("renders its sections and the caveats", () => {
    for (const heading of ["Hvad betyder det for en køber?", "Hvor god er prognosen?", "Forbehold"]) expect(html).toContain(heading);
  });

  it("prints no broken numbers", () => {
    expect(html).not.toMatch(/NaN|undefined|\[object|Infinity/);
  });

  it("uses no em or en dashes", () => {
    expect(html).not.toMatch(/[—–]/);
  });

  it("does not present the forecast as certain", () => {
    expect(html).toMatch(/ikke rådgivning/);
    expect(html).not.toMatch(/garanti|sikkert at/i);
  });
});

describe("TimingFindings", () => {
  const html = render(TimingFindings);

  it("renders figures from the analysis, not placeholders", () => {
    expect(html).toContain("Familiehandler");
    expect(html).toContain("offentlige vurdering");
    expect(html).not.toMatch(/NaN|undefined|\[object|Infinity/);
    expect(html).not.toMatch(/[—–]/);
  });

  it("is built from the same numbers as the findings module", () => {
    const findings = buildTimingFindings();
    expect(findings.houseValuation?.n).toBeGreaterThanOrEqual(30);
    expect(findings.saleTypes.find((s) => s.segment === "house")?.familyRelative).toBeLessThan(
      findings.saleTypes.find((s) => s.segment === "house")!.normalRelative,
    );
  });
});

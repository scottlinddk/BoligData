import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalysisTab } from "./analysis-tab";

describe("AnalysisTab", () => {
  const html = renderToStaticMarkup(createElement(AnalysisTab));

  it("renders every section with figures from the results file", () => {
    for (const heading of ["Direkte svar", "Datakvalitet", "Metode og validering", "Anvendelse på annoncer", "Begrænsninger og næste data"]) {
      expect(html).toContain(heading);
    }
    expect(html).not.toMatch(/NaN|undefined|\[object/);
  });

  it("uses no em or en dashes in the text", () => {
    expect(html).not.toMatch(/[—–]/);
  });

  it("shows no street addresses", () => {
    expect(html).not.toMatch(/\b[A-ZÆØÅ][a-zæøå]+(vej|gade|allé|vænge)\s+\d+/);
  });
});

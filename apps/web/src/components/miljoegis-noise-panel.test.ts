import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MiljoegisNoiseReport } from "@shared/types/miljoegis-noise";
vi.mock("@/hooks/use-miljoegis-noise", () => ({ useMiljoegisNoise: vi.fn() }));
import { MiljoegisNoiseContent } from "./miljoegis-noise-panel";

const report: MiljoegisNoiseReport = { status: "available", reason: null, checkedAt: "2026-09-28", mappingYear: 2022,
  calculationMethod: "Nord2000", heightMeters: 1.5, coordinates: { latitude: 57, longitude: 10 },
  mapUrl: "https://miljoegis.mim.dk/spatialmap?profile=noise",
  layers: [{ source: "urban_roads", metric: "Lden", layer: "ds_dk_2022_noise_vej_1_5m", status: "band_found", reason: null, bands: [{ lowerDb: 53, upperDb: 58 }] }] };
const render = (language: "da" | "en", result = report, loading = false) => renderToStaticMarkup(createElement(MiljoegisNoiseContent, {
  language, source: "urban_roads", metric: "Lden", onSourceChange: () => {}, onMetricChange: () => {}, result, loading, onRetry: () => {},
}));
describe("MiljøGIS listing panel", () => {
  it.each(["da", "en"] as const)("shows one selected source, actual band and model limitations in %s", language => {
    const html = render(language);
    for (const value of ["53–58 dB(A)", "Lden", "Lnight", "2022", "Nord2000", "profile=noise"]) expect(html).toContain(value);
    expect(html).toContain(language === "da" ? "Resultatet gælder kun" : "Each result applies only");
    expect(html).not.toContain(language === "da" ? "Ingen kontur betyder ikke" : "No contour does not establish");
    expect(html.match(/<option /g)).toHaveLength(8);
  });
  it("does not retain a prior band while loading, or display a fake band for no-hit or failed source", () => {
    expect(render("en", report, true)).not.toContain("53–58");
    const noHit = { ...report, layers: [{ ...report.layers[0]!, status: "no_contour" as const, bands: [] }] };
    expect(render("en", noHit)).toContain("No contour found in the selected layer");
    expect(render("en", noHit)).toContain("No contour does not establish");
    const failed = { ...noHit, status: "unavailable" as const, layers: [{ ...noHit.layers[0]!, status: "unavailable" as const, reason: "response_limit" as const }] };
    const html = render("en", failed);
    expect(html).toContain("noise level is unknown"); expect(html).toContain("too large"); expect(html).toContain("Try again");
    expect(html).not.toContain("dB(A)");
  });
});

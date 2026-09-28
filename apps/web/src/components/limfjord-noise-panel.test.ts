import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/hooks/use-limfjord-noise", () => ({ useLimfjordNoise: vi.fn() }));
import { LimfjordNoiseContent } from "./limfjord-noise-panel";
import { parseLimfjordReport } from "../../server/lib/enrichment-sources/limfjord-noise";
import { limfjordReportFixture } from "../../server/lib/test-support/limfjord-report";

describe("listing noise panel", () => {
  it.each(["da", "en"] as const)("renders bands with model years, caveats and current maps in %s", language => {
    const fixture = limfjordReportFixture(); fixture.language = language;
    const report = parseLimfjordReport(fixture, language, "https://tredjekort.vercel.app/api/address-report?id=example")!;
    const html = renderToStaticMarkup(createElement(LimfjordNoiseContent, {
      language, loading: false, onRetry: () => {}, result: { status: "available", checkedAt: "2026-09-28T12:00:00Z", report },
    }));
    expect(html).toContain("58–63 dB");
    expect(html).toContain("2021"); expect(html).toContain("2040"); expect(html).toContain("2035");
    expect(html).toContain(language === "da" ? "Manglende støjkontur betyder ikke" : "A missing contour does not establish");
    expect(html).toContain(language === "da" ? "ramper og lokale veje" : "ramps and local roads");
    expect(html).toContain("https://api.vejdirektoratet.dk/map.pdf");
  });

  it("shows an actionable unknown state on failure and never displays a noise value", () => {
    const html = renderToStaticMarkup(createElement(LimfjordNoiseContent, {
      language: "en", loading: false, onRetry: () => {}, result: { status: "unavailable", reason: "address_ambiguous", checkedAt: "2026-09-28" },
    }));
    expect(html).toContain("noise impact is unknown");
    expect(html).toContain("None was selected");
    expect(html).toContain("Try again");
    expect(html).not.toContain("dB");
  });
});

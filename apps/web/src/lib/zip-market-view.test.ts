import { describe, expect, it } from "vitest";
import { analyzeRelationships, summarizePhases } from "@shared/analysis/zip-market-relationships";
import { buildSeasonality, buildStatsView, buildYearlyRows } from "@/lib/zip-market-view";
import { buildPhaseRemarks, buildRelationshipRemarks } from "@/lib/zip-market-remarks";
import { makeStatsFormat } from "@/lib/stats-format";

describe("stats view model", () => {
  const view = buildStatsView();

  it("covers 189 months and five KPIs for the latest month", () => {
    expect(view.monthCount).toBe(189);
    expect(view.latestMonth).toBe("2026-09");
    expect(view.kpis.map((k) => k.key)).toEqual(["asking", "sold", "supply", "daysOnMarket", "discount"]);
  });

  it("matches the year-over-year figures the source reports for September 2026", () => {
    const kpi = (key: string) => view.kpis.find((k) => k.key === key)!;
    expect(kpi("sold").value).toBe(27_690);
    expect(kpi("sold").percentChange).toBeCloseTo(14.94, 2);
    expect(kpi("daysOnMarket").percentChange).toBeCloseTo(53.06, 2);
    expect(kpi("supply").absoluteChange).toBe(-32);
    // The discount is shown as a size: 865 now against 825 a year earlier.
    expect(kpi("discount").value).toBe(865);
    expect(kpi("discount").absoluteChange).toBe(40);
  });

  it("puts the latest asking and sold prices at or near the top of the history", () => {
    const kpi = (key: string) => view.kpis.find((k) => k.key === key)!;
    expect(kpi("asking").percentile).toBeGreaterThan(99);
    expect(kpi("sold").percentile).toBeGreaterThan(98);
    expect(kpi("sold").max.month).toBe("2026-07");
    expect(kpi("supply").min).toEqual({ value: 94, month: "2022-01" });
    expect(view.kpis.every((k) => k.trend.length === 60)).toBe(true);
  });

  it("builds yearly rows with 2026 marked as partial and no change against a partial year", () => {
    const rows = buildYearlyRows();
    expect(rows).toHaveLength(16);
    expect(rows[0]!.soldChangePercent).toBeNull();
    expect(rows.at(-1)).toMatchObject({ year: 2026, months: 9, partial: true, soldChangePercent: null });
    expect(rows.find((r) => r.year === 2025)!.soldChangePercent).toBeCloseTo((23_440 / 23_330 - 1) * 100, 0);
  });

  it("gives twelve seasonal values per series", () => {
    for (const row of buildSeasonality()) expect(row.deviations).toHaveLength(12);
  });

  // The page describes these seasonal patterns in words. Pin them so a refreshed snapshot cannot leave the text wrong.
  it("matches the seasonal pattern described on the page", () => {
    const row = (key: string) => buildSeasonality().find((r) => r.key === key)!.deviations;
    const peakMonth = (values: number[]) => values.indexOf(Math.max(...values)) + 1;
    const lowMonth = (values: number[]) => values.indexOf(Math.min(...values)) + 1;
    // Days on market: longest in winter, shortest late summer.
    expect(peakMonth(row("daysOnMarket"))).toBeLessThanOrEqual(3);
    expect(lowMonth(row("daysOnMarket"))).toBeGreaterThanOrEqual(7);
    expect(lowMonth(row("daysOnMarket"))).toBeLessThanOrEqual(10);
    // Supply: lowest in winter, highest in the summer half.
    expect(lowMonth(row("supply"))).toBeLessThanOrEqual(2);
    expect(peakMonth(row("supply"))).toBeGreaterThanOrEqual(6);
    expect(peakMonth(row("supply"))).toBeLessThanOrEqual(10);
    // Sold price: the highest months come at the end of the year, and the swing is the smallest of the three.
    expect(peakMonth(row("sold"))).toBeGreaterThanOrEqual(11);
    const swing = (values: number[]) => Math.max(...values) - Math.min(...values);
    expect(swing(row("sold"))).toBeLessThan(swing(row("daysOnMarket")));
    expect(swing(row("sold"))).toBeLessThan(swing(row("supply")) + 5);
  });
});

describe("written remarks", () => {
  const summaries = summarizePhases();
  const report = analyzeRelationships();

  for (const language of ["da", "en"] as const) {
    it(`renders every phase and relationship remark in ${language} without unresolved numbers`, () => {
      const phases = buildPhaseRemarks(language, summaries);
      const relationships = buildRelationshipRemarks(language, report);
      expect(phases).toHaveLength(8);
      expect(relationships.length).toBeGreaterThanOrEqual(6);
      for (const text of [...phases.flatMap((p) => [p.title, p.body, p.period]), ...relationships.flatMap((r) => [r.title, r.body, r.evidence])]) {
        expect(text).not.toMatch(/NaN|undefined|null|Infinity|\$\{/);
        expect(text).not.toContain("—");
        expect(text.trim().length).toBeGreaterThan(5);
      }
    });
  }

  it("labels strength conservatively and leaves non-correlation remarks unlabelled", () => {
    const byId = Object.fromEntries(buildRelationshipRemarks("en", report).map((r) => [r.id, r]));
    expect(byId["asking-leads-sold"]!.strength).toBe("strong");
    expect(byId["supply-vs-asking"]!.strength).toBe("moderate");
    // Strong on annual averages (0.71) but weak on monthly changes (0.39): the weaker one wins.
    expect(byId["supply-vs-days"]!.strength).toBe("weak");
    expect(byId["discount"]!.strength).toBe("negligible");
    expect(byId["sold-is-noisy"]!.strength).toBeNull();
  });

  it("writes month spans without stray abbreviation periods", () => {
    for (const language of ["da", "en"] as const) {
      for (const r of buildRelationshipRemarks(language, report)) expect(`${r.body} ${r.evidence}`).not.toMatch(/\.\./);
    }
  });

  it("quotes figures from the data rather than typed-in numbers", () => {
    const f = makeStatsFormat("en");
    const rebound = buildPhaseRemarks("en", summaries).find((p) => p.id === "price-rebound")!;
    expect(rebound.body).toContain(f.int(28_021));
    expect(rebound.body).toContain(f.int(27_690));
    const cooling = buildPhaseRemarks("en", summaries).find((p) => p.id === "cooling")!;
    expect(cooling.body).toContain(f.int(21_719));
    expect(cooling.body).not.toMatch(/fell -|rose \+/);
  });

  it("keeps the signed-percent wording free of double negatives", () => {
    for (const language of ["da", "en"] as const) {
      for (const phase of buildPhaseRemarks(language, summaries)) {
        expect(phase.body).not.toMatch(/(faldt|fell|gav efter|gave way|steg|rose) [-+]/);
      }
    }
  });
});

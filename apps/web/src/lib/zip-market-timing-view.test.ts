import { describe, expect, it } from "vitest";
import { buildTimingView, describeRuns, levelOf } from "@/lib/zip-market-timing-view";

describe("timing view", () => {
  const view = buildTimingView();

  it("gives buyers leverage in the cold half and sellers the warm half", () => {
    expect(view.leverageRuns).toEqual([[11, 12, 1, 2, 3]].map((r) => r));
    expect(view.sellerRuns.flat()).toEqual(expect.arrayContaining([6, 7, 8, 9]));
    for (const m of view.leverageRuns.flat()) expect(view.sellerRuns.flat()).not.toContain(m);
  });

  it("offers the widest choice from summer into autumn", () => {
    expect(view.selectionRuns.flat()).toEqual(expect.arrayContaining([6, 8, 9, 10]));
  });

  it("picks January as the strongest month and flags November and December as tentative", () => {
    expect(view.bestLeverageMonth).toBe(1);
    expect(view.solidLeverageMonths).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(view.tentativeLeverageMonths).toEqual(expect.arrayContaining([11, 12]));
  });

  it("finds November the one month with good leverage and normal supply", () => {
    expect(view.balancedMonths).toEqual([11]);
  });

  it("reports the latest month against earlier years", () => {
    expect(view.latest.map((l) => l.key)).toEqual(["daysOnMarket", "supply", "discount"]);
    // October 2026: 103 days against about 86 for the same month in earlier years. Still slower than typical.
    expect(view.latest[0]!.difference).toBeGreaterThan(10);
  });

  it("labels every month with one plain category", () => {
    expect(view.categories).toEqual([
      "negotiate", "negotiate", "negotiate", "neutral", "fast", "choice",
      "choice", "choice", "choice", "choice", "balance", "negotiate",
    ]);
  });

  it("classifies z-scores", () => {
    expect(levelOf(0.5)).toBe("high");
    expect(levelOf(0)).toBe("middle");
    expect(levelOf(-0.5)).toBe("low");
  });

  it("describes runs across the year boundary", () => {
    const names = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    expect(describeRuns([[11, 12, 1, 2, 3]], names, "til", "og")).toBe("nov til mar");
    expect(describeRuns([[3], [6, 7]], names, "til", "og")).toBe("mar og jun til jul");
    expect(describeRuns([], names, "til", "og")).toBe("");
  });
});

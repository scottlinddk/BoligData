import { describe, expect, it } from "vitest";
import { hedonicResults as R } from "@shared/analysis/hedonic-results";
import { METHOD_ORDER, buildHeadline, fmt, rowFor } from "@/lib/hedonic-view";

describe("hedonic results file", () => {
  it("has a consistent audit waterfall", () => {
    const steps = R.dev.audit.steps;
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.remaining).toBe(steps[i - 1]!.remaining - steps[i]!.removed);
    }
  });

  it("reports every method for both segments with a finite MdAPE", () => {
    for (const segment of ["house", "apartment"] as const) {
      for (const method of METHOD_ORDER) {
        const row = rowFor(R.dev.rolling.pooled, segment, method);
        expect(row, `${segment}/${method}`).toBeDefined();
        expect(row!.mdape).not.toBeNull();
        expect(Number.isFinite(row!.mdape!)).toBe(true);
      }
    }
  });

  it("opened the untouched test set exactly once and keeps it small enough to be marked indicative", () => {
    expect(R.final.pristine).toBe(true);
    for (const row of R.final.summary) expect(row.indicative).toBe(row.n < 30);
  });

  it("reproduces the pre-registered decision rule from the paired comparisons", () => {
    for (const segment of ["house", "apartment"] as const) {
      const decision = R.dev.decision[segment]!;
      const challengers = R.dev.rolling.paired_vs_baseline.filter(
        (p) => p.segment === segment && p.baseline === decision.best_baseline && p.diff !== null,
      );
      const winners = challengers.filter((p) => p.relative_change! <= -0.1 && p.hi! < 0);
      if (winners.length === 0) expect(decision.recommended).toBe(decision.best_baseline);
      else expect(winners.map((w) => w.challenger)).toContain(decision.recommended);
    }
  });
});

describe("headline", () => {
  it("grades evidence from the holdout, not from the rolling result", () => {
    const house = buildHeadline(R, "house")!;
    const apartment = buildHeadline(R, "apartment")!;
    expect(house.holdout!.n).toBeLessThan(10);
    expect(house.evidence).toBe("meget svag");
    expect(apartment.holdoutRatio).toBeGreaterThan(1.5);
    expect(apartment.evidence).toBe("svag");
  });
});

describe("formatting", () => {
  it("uses Danish decimals and keeps percent and percentage points apart", () => {
    expect(fmt.pct(0.155)).toBe("15,5 %");
    expect(fmt.signedPct(-0.059)).toBe("−5,9 %");
    expect(fmt.signedPp(0.022)).toBe("+2,2 pp");
    expect(fmt.pct(null)).toBe("-");
  });
});

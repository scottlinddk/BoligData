import { describe, expect, it } from "vitest";
import type { SparHistoryPoint, SparListingEstimate } from "@shared/types/spar";
import { estimateFactors, formatMillions, formatSignedPercent, levelTrend, rangeLayout, valuationFitType } from "./smart-estimate";

const point = (period: string, estimate: number): SparHistoryPoint => ({ period, estimate, lo80: estimate * 0.9, hi80: estimate * 1.1, preliminary: false });
const months = (from: string, count: number, start: number, step: number) => {
  const [y, m] = from.split("-").map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const idx = y * 12 + (m - 1) + i;
    return point(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`, start + step * i);
  });
};
const base: SparListingEstimate = {
  status: "available", reason: null, isUnit: false, valuation: { valueDkk: 2_000_000, year: 2024, bfe: "1" },
  index: { period: "2025-09", ratio: 1.1, lo80: 1.05, hi80: 1.15, nPeriod: 5, nSales: 60, valuationVintage: 2024, preliminary: false, ageMonths: 1, stale: false },
  fairPrice: { estimate: 2_200_000, lo80: 2_000_000, hi80: 2_400_000, lo95: 1_800_000, hi95: 2_600_000 },
  askingPrice: 2_420_000, askingVsFair: 0.1, history: months("2024-09", 13, 2_000_000, 16_667), asOf: "2025-10-01", method: "own-spar-local-level/1",
};

describe("levelTrend", () => {
  it("compares the newest month with the same month a year earlier", () => {
    const t = levelTrend(base.history)!;
    expect(t.months).toBe(12);
    expect(t.change).toBeCloseTo(base.history[12]!.estimate / base.history[0]!.estimate - 1, 9);
  });
  it("is null when the history is shorter than the window", () => {
    expect(levelTrend(base.history.slice(5))).toBeNull();
    expect(levelTrend([])).toBeNull();
  });
});

describe("estimateFactors", () => {
  it("is empty without an estimate", () => {
    expect(estimateFactors({ ...base, status: "insufficient_data", reason: "too_few_sales", fairPrice: null, index: null, history: [] })).toEqual([]);
  });
  it("lists evidence in order and compares asking with the estimate and the valuation", () => {
    const kinds = estimateFactors(base, "villa").map(f => f.kind);
    expect(kinds).toEqual(["valuation", "market_level", "trend", "asking_vs_estimate", "asking_vs_valuation"]);
    const asking = estimateFactors(base, "villa").find(f => f.kind === "asking_vs_estimate");
    expect(asking).toMatchObject({ withinInterval: false, ratio: 0.1 });
  });
  it("gives no valuation verdict for apartments", () => {
    expect(estimateFactors({ ...base, isUnit: true }, "ejerlejlighed").map(f => f.kind)).not.toContain("asking_vs_valuation");
  });
  it("gives no valuation verdict for summer houses either", () => {
    expect(estimateFactors(base, "summer_house").map(f => f.kind)).not.toContain("asking_vs_valuation");
    expect(estimateFactors(base, "villa").map(f => f.kind)).toContain("asking_vs_valuation");
  });
  it("maps app property types to the labels the comparison understands", () => {
    expect(valuationFitType("apartment", false)).toBe("lejlighed");
    expect(valuationFitType("villa", true)).toBe("lejlighed");
    expect(valuationFitType("summer_house", false)).toBe("fritidshus");
    expect(valuationFitType("villa", false)).toBe("villa");
    expect(valuationFitType(null, false)).toBeNull();
  });
  it("ends with warnings for old or preliminary levels", () => {
    const kinds = estimateFactors({ ...base, index: { ...base.index!, stale: true, preliminary: true, ageMonths: 15 } }).map(f => f.kind);
    expect(kinds.slice(-2)).toEqual(["stale", "preliminary"]);
  });
  it("skips asking comparisons when there is no asking price", () => {
    const kinds = estimateFactors({ ...base, askingPrice: null, askingVsFair: null }).map(f => f.kind);
    expect(kinds).not.toContain("asking_vs_estimate");
  });
});

describe("rangeLayout", () => {
  it("places the interval inside the 95 % domain", () => {
    const r = rangeLayout(base.fairPrice!, 2_200_000);
    expect(r.lo80).toBeCloseTo(25, 5);
    expect(r.hi80).toBeCloseTo(75, 5);
    expect(r.estimate).toBeCloseTo(50, 5);
    expect(r.asking).toBeCloseTo(50, 5);
    expect(r.outside).toBeNull();
  });
  it("clamps an asking price outside the bar and says which side", () => {
    expect(rangeLayout(base.fairPrice!, 3_000_000)).toMatchObject({ asking: 100, outside: "above" });
    expect(rangeLayout(base.fairPrice!, 1_000_000)).toMatchObject({ asking: 0, outside: "below" });
    expect(rangeLayout(base.fairPrice!, null)).toMatchObject({ asking: null, outside: null });
  });
});

describe("formatMillions", () => {
  it("uses Danish and English conventions", () => {
    expect(formatMillions(2_800_000, "da")).toBe("2,8 mio.");
    expect(formatMillions(2_800_000, "en")).toBe("2.8 m");
  });
});

describe("formatSignedPercent", () => {
  it("signs with a real minus and localises the decimal mark", () => {
    expect(formatSignedPercent(0.1, "da")).toBe("+10 %");
    expect(formatSignedPercent(-0.032, "da", 1)).toBe("−3,2 %");
    expect(formatSignedPercent(-0.032, "en", 1)).toBe("−3.2 %");
  });
});

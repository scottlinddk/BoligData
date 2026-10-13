import { describe, expect, it } from "vitest";
import {
  chainVintages, compareWithDst, enumeratePeriods, fairPrice, isPreliminary, localLevelIndex,
  ratioOfSums, selectValuation, sparPeriod, sparSeries, trimSparSales,
  type SparSale, type SparValuation,
} from "@shared/analysis/spar";

const sale = (id: string, agreementDate: string, price: number, valuation: number, freeTrade = true): SparSale => ({ id, agreementDate, price, valuation, freeTrade });

describe("trimSparSales", () => {
  it("applies the DST rules: free trade only and afstandsprocent 0.4 to 4", () => {
    const r = trimSparSales([
      sale("ok", "2024-01-10", 2_000_000, 1_000_000),
      sale("edge-low", "2024-01-10", 400_000, 1_000_000),
      sale("edge-high", "2024-01-10", 4_000_000, 1_000_000),
      sale("low", "2024-01-10", 399_999, 1_000_000),
      sale("high", "2024-01-10", 4_000_001, 1_000_000),
      sale("family", "2024-01-10", 1_000_000, 1_000_000, false),
      sale("bad-date", "2024-13-40", 1_000_000, 1_000_000),
      sale("no-valuation", "2024-01-10", 1_000_000, 0),
    ]);
    expect(r.kept.map((s) => s.id)).toEqual(["ok", "edge-low", "edge-high"]);
    expect(r.excluded).toEqual({ notFreeTrade: 1, invalid: 2, extreme: 2 });
  });
});

describe("periods", () => {
  it("names months and quarters and enumerates gaps", () => {
    expect(sparPeriod("2024-05-31", "month")).toBe("2024-05");
    expect(sparPeriod("2024-05-31", "quarter")).toBe("2024-Q2");
    expect(enumeratePeriods("2023-11", "2024-02", "month")).toEqual(["2023-11", "2023-12", "2024-01", "2024-02"]);
    expect(enumeratePeriods("2023-Q3", "2024-Q2", "quarter")).toEqual(["2023-Q3", "2023-Q4", "2024-Q1", "2024-Q2"]);
  });

  it("marks periods younger than 13 months as preliminary", () => {
    expect(isPreliminary("2025-10", "2026-10-13", "month")).toBe(true);
    expect(isPreliminary("2025-09", "2026-10-13", "month")).toBe(false);
    expect(isPreliminary("2025-Q4", "2026-10-13", "quarter")).toBe(true);
    expect(isPreliminary("2025-Q3", "2026-10-13", "quarter")).toBe(false);
  });
});

describe("ratioOfSums", () => {
  it("weights by valuation, not by sale", () => {
    // mean of ratios is (2 + 1) / 2 = 1.5, but value weighted is (2M + 1M) / (1M + 3M) = 0.75
    expect(ratioOfSums([sale("a", "2024-01-01", 2_000_000, 1_000_000), sale("b", "2024-01-02", 3_000_000, 3_000_000)])).toBeCloseTo(1.25);
    expect(ratioOfSums([sale("a", "2024-01-01", 2_000_000, 1_000_000), sale("b", "2024-01-02", 1_000_000, 3_000_000)])).toBeCloseTo(0.75);
    expect(ratioOfSums([])).toBeNull();
  });
});

describe("sparSeries", () => {
  it("keeps empty periods between the first and last sale", () => {
    const s = sparSeries([sale("a", "2024-01-05", 1_100, 1_000), sale("b", "2024-03-05", 1_200, 1_000)], "month");
    expect(s.map((p) => [p.period, p.n])).toEqual([["2024-01", 1], ["2024-02", 0], ["2024-03", 1]]);
    expect(s[1]!.ratio).toBeNull();
  });
});

describe("selectValuation", () => {
  const v = (valuationYear: number, bfeType: SparValuation["bfeType"], registeredAt: string | null, value = 1_000_000): SparValuation =>
    ({ bfe: "1", bfeType, valuationYear, value, registeredAt });
  const rows = [v(2020, "EL", "2021-06-01"), v(2022, "EL", "2025-02-01"), v(2022, "SFE", "2025-02-01"), v(2024, "EL", null)];

  it("never uses a valuation registered after the as-of date", () => {
    expect(selectValuation(rows, { asOf: "2024-12-31", isUnit: true })?.valuationYear).toBe(2020);
    expect(selectValuation(rows, { asOf: "2026-01-01", isUnit: true })?.valuationYear).toBe(2022);
  });
  it("ignores rows with unknown registration time", () => {
    expect(selectValuation(rows, { asOf: "2030-01-01", isUnit: true })?.valuationYear).toBe(2022);
  });
  it("uses the EL value for apartments and the SFE value for houses, never the other", () => {
    expect(selectValuation([v(2022, "SFE", "2025-02-01")], { asOf: "2026-01-01", isUnit: true })).toBeNull();
    expect(selectValuation(rows, { asOf: "2026-01-01", isUnit: false })?.bfeType).toBe("SFE");
  });
  it("can pin a vintage", () => {
    expect(selectValuation(rows, { asOf: "2026-01-01", isUnit: true, vintage: 2020 })?.valuationYear).toBe(2020);
  });
});

describe("chainVintages", () => {
  it("rescales the newer vintage to the older over the overlap and switches at the given period", () => {
    const older = [{ period: "2024-Q1", ratio: 1.2, n: 10 }, { period: "2024-Q2", ratio: 1.25, n: 10 }];
    const newer = [{ period: "2024-Q2", ratio: 1.0, n: 10 }, { period: "2024-Q3", ratio: 1.04, n: 10 }];
    const out = chainVintages(older, newer, "2024-Q3")!;
    expect(out.find((p) => p.period === "2024-Q1")!.ratio).toBeCloseTo(1.2);
    expect(out.find((p) => p.period === "2024-Q3")!.ratio).toBeCloseTo(1.04 * 1.25);
  });
  it("refuses to chain without an overlap", () => {
    expect(chainVintages([{ period: "2024-Q1", ratio: 1, n: 5 }], [{ period: "2024-Q3", ratio: 1, n: 5 }], "2024-Q3")).toBeNull();
  });
});

function seeded(seed: number) {
  let x = seed;
  return () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; };
}
const normal = (rand: () => number) => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

describe("localLevelIndex", () => {
  const rand = seeded(7);
  const sales: SparSale[] = [];
  // 36 months, about 3 sales a month, true level drifts from 1.0 to 1.3, sale noise sd 0.15
  for (let m = 0; m < 36; m++) {
    const level = 1 + 0.3 * (m / 35);
    const year = 2021 + Math.floor(m / 12), month = (m % 12) + 1;
    for (let k = 0; k < 3; k++) {
      const ratio = level * Math.exp(0.15 * normal(rand));
      sales.push(sale(`${m}-${k}`, `${year}-${String(month).padStart(2, "0")}-15`, Math.round(ratio * 1_000_000), 1_000_000));
    }
  }
  const out = localLevelIndex(sales, { granularity: "month", asOf: "2024-06-01" });

  it("covers every month and keeps bands ordered", () => {
    expect(out).toHaveLength(36);
    for (const p of out) {
      expect(p.lo95).toBeLessThanOrEqual(p.lo80);
      expect(p.lo80).toBeLessThanOrEqual(p.estimate);
      expect(p.estimate).toBeLessThanOrEqual(p.hi80);
      expect(p.hi80).toBeLessThanOrEqual(p.hi95);
    }
  });
  it("tracks the drift and covers the true level most of the time", () => {
    expect(out[35]!.estimate).toBeGreaterThan(out[0]!.estimate);
    const covered = out.filter((p, m) => { const truth = 1 + 0.3 * (m / 35); return truth >= p.lo95 && truth <= p.hi95; }).length;
    expect(covered / out.length).toBeGreaterThan(0.8);
  });
  it("flags recent months as preliminary and widens them", () => {
    expect(out[35]!.preliminary).toBe(true);
    expect(out[0]!.preliminary).toBe(false);
  });
  it("bridges an empty month with a wider interval than its neighbours", () => {
    const gap = localLevelIndex(sales.filter((s) => !s.agreementDate.startsWith("2022-06")), { granularity: "month", asOf: "2024-06-01" });
    const june = gap.find((p) => p.period === "2022-06")!;
    const may = gap.find((p) => p.period === "2022-05")!;
    expect(june.n).toBe(0);
    expect(june.se).toBeGreaterThan(may.se);
  });
  it("returns nothing for fewer than two usable sales", () => {
    expect(localLevelIndex([sale("a", "2024-01-01", 1_000, 1_000)], { granularity: "month", asOf: "2024-06-01" })).toEqual([]);
  });
});

describe("compareWithDst", () => {
  it("scores agreement in changes and ignores level differences", () => {
    const own = [100, 102, 105, 104].map((v, i) => ({ period: `2024-Q${i + 1}`, estimate: v / 100, lo80: 0, hi80: 0, lo95: 0, hi95: 0, se: 0.02, n: 5, preliminary: false }));
    const dst = new Map([["2024-Q1", 200], ["2024-Q2", 204], ["2024-Q3", 210], ["2024-Q4", 208]]);
    const r = compareWithDst(own, dst);
    expect(r.periods).toBe(3);
    expect(r.meanAbsDiffPct).toBeCloseTo(0, 6);
    expect(r.correlation).toBeCloseTo(1, 6);
    expect(r.coverage80).toBe(1);
  });
  it("reports nothing without overlapping periods", () => {
    expect(compareWithDst([], new Map()).periods).toBe(0);
  });
});

describe("fairPrice", () => {
  it("multiplies valuation by the index and widens with residual spread", () => {
    const base = fairPrice(2_000_000, { estimate: 1.5, se: 0.05 })!;
    expect(base.estimate).toBeCloseTo(3_000_000);
    const wide = fairPrice(2_000_000, { estimate: 1.5, se: 0.05 }, 0, 0.15)!;
    expect(wide.hi80 - wide.lo80).toBeGreaterThan(base.hi80 - base.lo80);
    expect(fairPrice(0, { estimate: 1.5, se: 0.05 })).toBeNull();
  });
});

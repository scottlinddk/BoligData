import { describe, expect, it } from "vitest";
import { buildSparSegment, estimateForListing, SPAR_MIN_SALES, type SparSaleRow, type SparValuationRow } from "./spar-estimate.js";

const val = (propertyId: string, value: number, year = 2024, bfeType: "EL" | "SFE" = "SFE"): SparValuationRow =>
  ({ propertyId, bfe: `bfe-${propertyId}`, bfeType, valuationYear: year, value, registeredAt: "2025-01-01T00:00:00Z" });
const month = (i: number) => `2025-${String(1 + (i % 9)).padStart(2, "0")}-15`;

function market(n: number, ratio = 1.1) {
  const valuations: SparValuationRow[] = [];
  const sales: SparSaleRow[] = [];
  for (let i = 0; i < n; i++) {
    valuations.push(val(`p${i}`, 2_000_000));
    sales.push({ id: `s${i}`, propertyId: `p${i}`, soldDate: month(i), price: Math.round(2_000_000 * ratio * (1 + ((i % 5) - 2) * 0.01)), saleType: "normal" });
  }
  return { valuations, sales };
}

describe("estimateForListing", () => {
  it("multiplies the listing's valuation by the market ratio and compares the asking price", () => {
    const m = market(40);
    const segment = buildSparSegment({ asOf: "2025-10-01", isUnit: false, ...m });
    const r = estimateForListing(segment, { propertyId: "p0", askingPrice: 2_420_000 });
    expect(r.status).toBe("available");
    expect(r.index!.ratio).toBeGreaterThan(1.05);
    expect(r.index!.ratio).toBeLessThan(1.15);
    expect(r.fairPrice!.estimate).toBeCloseTo(2_000_000 * r.index!.ratio, 0);
    expect(r.fairPrice!.lo80).toBeLessThan(r.fairPrice!.estimate);
    expect(r.askingVsFair).toBeCloseTo(2_420_000 / r.fairPrice!.estimate - 1, 6);
  });

  it("re-prices this home's valuation with each month's market level", () => {
    const segment = buildSparSegment({ asOf: "2025-10-01", isUnit: false, ...market(40) });
    const r = estimateForListing(segment, { propertyId: "p0", askingPrice: null });
    expect(r.history.length).toBeGreaterThan(1);
    expect(r.history.map(p => p.period)).toEqual([...r.history.map(p => p.period)].sort());
    const last = r.history[r.history.length - 1]!;
    expect(last.estimate).toBeCloseTo(r.fairPrice!.estimate, 0);
    for (const p of r.history) expect(p.lo80).toBeLessThan(p.hi80);
  });

  it("has no history when there is no estimate", () => {
    const segment = buildSparSegment({ asOf: "2025-10-01", isUnit: false, ...market(SPAR_MIN_SALES - 1) });
    expect(estimateForListing(segment, { propertyId: "p0", askingPrice: 1 }).history).toEqual([]);
  });

  it("reports insufficient data instead of a number when there are too few sales", () => {
    const segment = buildSparSegment({ asOf: "2025-10-01", isUnit: false, ...market(SPAR_MIN_SALES - 1) });
    const r = estimateForListing(segment, { propertyId: "p0", askingPrice: 2_000_000 });
    expect(r).toMatchObject({ status: "insufficient_data", reason: "too_few_sales", fairPrice: null, index: null });
  });

  it("still shows an old index, flagged with its age", () => {
    const segment = buildSparSegment({ asOf: "2027-01-01", isUnit: false, ...market(40) });
    const r = estimateForListing(segment, { propertyId: "p0", askingPrice: null });
    expect(r.status).toBe("available");
    expect(r.index!.stale).toBe(true);
    expect(r.index!.ageMonths).toBeGreaterThan(12);
    const fresh = estimateForListing(buildSparSegment({ asOf: "2025-10-01", isUnit: false, ...market(40) }), { propertyId: "p0", askingPrice: null });
    expect(fresh.index!.stale).toBe(false);
  });

  it("has no estimate for a property without a valuation", () => {
    const segment = buildSparSegment({ asOf: "2025-10-01", isUnit: false, ...market(40) });
    expect(estimateForListing(segment, { propertyId: "unknown", askingPrice: 1 })).toMatchObject({ status: "no_valuation", reason: "no_valuation_for_property" });
  });

  it("refuses a valuation from another vintage than the index", () => {
    const m = market(40);
    m.valuations.push(val("odd", 1_000_000, 2022));
    const segment = buildSparSegment({ asOf: "2025-10-01", isUnit: false, ...m });
    expect(estimateForListing(segment, { propertyId: "odd", askingPrice: null })).toMatchObject({ status: "no_valuation", reason: "valuation_vintage_mismatch" });
  });

  it("ignores family sales and ignores valuations without a known date", () => {
    const m = market(40);
    m.sales.forEach((s, i) => { if (i % 2 === 0) s.saleType = "family"; });
    expect(buildSparSegment({ asOf: "2025-10-01", isUnit: false, ...m }).nSales).toBe(20);
    const unknown = market(40);
    unknown.valuations.forEach((v) => { v.registeredAt = null; });
    expect(buildSparSegment({ asOf: "2025-10-01", isUnit: false, ...unknown }).unavailable).toBe("too_few_sales");
  });
});

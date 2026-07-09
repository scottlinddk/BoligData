import { describe, expect, it } from "vitest";
import { daysBetween, estimateYield, pricePerSqm, priceTrendPercent } from "@shared/utils/price";

describe("pricePerSqm", () => {
  it("rounds to the nearest whole DKK", () => {
    expect(pricePerSqm(1000000, 77)).toBe(12987);
  });

  it("returns 0 for non-positive sqm", () => {
    expect(pricePerSqm(1000000, 0)).toBe(0);
  });
});

describe("daysBetween", () => {
  it("computes whole days between two ISO dates", () => {
    expect(daysBetween("2026-01-01", "2026-01-11")).toBe(10);
  });

  it("never returns a negative value", () => {
    expect(daysBetween("2026-01-11", "2026-01-01")).toBe(0);
  });
});

describe("estimateYield", () => {
  it("computes gross yield as a percentage with one decimal", () => {
    expect(estimateYield(120000, 2000000)).toBe(6);
  });

  it("returns null for non-positive price", () => {
    expect(estimateYield(120000, 0)).toBeNull();
  });
});

describe("priceTrendPercent", () => {
  it("computes percent difference vs a neighborhood average", () => {
    expect(priceTrendPercent(22000, 20000)).toBe(10);
  });

  it("returns null when the neighborhood average is non-positive", () => {
    expect(priceTrendPercent(22000, 0)).toBeNull();
  });
});

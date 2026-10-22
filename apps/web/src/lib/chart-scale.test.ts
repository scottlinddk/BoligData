import { describe, expect, it } from "vitest";
import { linearScale, nearestIndex, niceTicks } from "@/lib/chart-scale";

describe("chart scale helpers", () => {
  it("produces round ticks that cover the range", () => {
    const ticks = niceTicks(13_922, 28_021, 4);
    expect(ticks[0]!).toBeLessThanOrEqual(13_922);
    expect(ticks.at(-1)!).toBeGreaterThanOrEqual(28_021);
    expect(ticks.every((t) => t % 2_500 === 0 || t % 5_000 === 0)).toBe(true);
    expect(niceTicks(0, 227, 4)).toEqual([0, 100, 200, 300]);
    expect(niceTicks(5, 5)).toEqual([5]);
    // The last tick must reach the maximum: the discount panel peaks at 1,185 and was once clipped at 1,000.
    for (const [lo, hi] of [[283, 1236], [0, 227], [13_000, 28_500], [41, 177], [94, 227], [0.2, 0.9]] as const) {
      const ticks = niceTicks(lo, hi, 3);
      expect(ticks[0]!).toBeLessThanOrEqual(lo);
      expect(ticks.at(-1)!).toBeGreaterThanOrEqual(hi);
      expect(ticks.length).toBeLessThanOrEqual(8);
    }
    expect(niceTicks(Number.NaN, 5)).toEqual([]);
  });

  it("maps a domain linearly and handles a flat domain", () => {
    const y = linearScale([0, 100], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(100)).toBe(0);
    expect(y(50)).toBe(100);
    expect(linearScale([5, 5], [0, 10])(5)).toBe(5);
  });

  it("finds the nearest point and clamps outside the plot", () => {
    expect(nearestIndex(50, 0, 100, 11)).toBe(5);
    expect(nearestIndex(-20, 0, 100, 11)).toBe(0);
    expect(nearestIndex(500, 0, 100, 11)).toBe(10);
    expect(nearestIndex(10, 0, 100, 1)).toBe(0);
  });
});

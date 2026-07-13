import { describe, expect, it } from "vitest";
import { lookupNoiseExposure } from "./stoejkort.js";

describe("lookupNoiseExposure (mock mode)", () => {
  it("returns a deterministic Lden value in a realistic dB range for the same point", async () => {
    const first = await lookupNoiseExposure(57.05, 9.92);
    const second = await lookupNoiseExposure(57.05, 9.92);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.data.ldenDb).not.toBeNull();
      expect(first.data.ldenDb).toBeGreaterThanOrEqual(40);
      expect(first.data.ldenDb).toBeLessThan(65);
    }
  });

  it("varies with the input point", async () => {
    const a = await lookupNoiseExposure(57.05, 9.92);
    const b = await lookupNoiseExposure(56.5, 10.5);
    expect(a).not.toEqual(b);
  });
});

import { describe, expect, it } from "vitest";
import { lookupSoilContamination } from "./miljoeportalen-v1v2.js";

describe("lookupSoilContamination (mock mode)", () => {
  it("returns a deterministic classification for the same point, never 'unknown' in mock mode", async () => {
    const first = await lookupSoilContamination(57.05, 9.92);
    const second = await lookupSoilContamination(57.05, 9.92);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (first.ok) expect(["none", "v1", "v2"]).toContain(first.data.classification);
  });
});

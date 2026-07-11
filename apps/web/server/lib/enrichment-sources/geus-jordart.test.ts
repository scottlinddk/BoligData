import { describe, expect, it } from "vitest";
import { lookupSoilType } from "./geus-jordart.js";

describe("lookupSoilType (mock mode)", () => {
  it("returns a deterministic jordart for the same point", async () => {
    const first = await lookupSoilType(57.05, 9.92);
    const second = await lookupSoilType(57.05, 9.92);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.data.jordart).not.toBeNull();
  });
});

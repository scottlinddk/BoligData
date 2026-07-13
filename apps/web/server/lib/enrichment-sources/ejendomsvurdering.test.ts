import { describe, expect, it } from "vitest";
import { lookupEjendomsvurdering } from "./ejendomsvurdering.js";

describe("lookupEjendomsvurdering (mock mode)", () => {
  it("returns a deterministic valuation for the same matrikelnr/ejerlav", async () => {
    const first = await lookupEjendomsvurdering("15a", "Test Ejerlav");
    const second = await lookupEjendomsvurdering("15a", "Test Ejerlav");
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
  });

  it("returns all valuation fields populated", async () => {
    const result = await lookupEjendomsvurdering("15a", "Test Ejerlav");
    if (!result.ok) throw new Error("expected ok result");
    expect(result.data.assessedPropertyValueDkk).not.toBeNull();
    expect(result.data.assessedLandValueDkk).not.toBeNull();
    expect(result.data.valuationYear).not.toBeNull();
  });

  it("fails without a matrikelnr", async () => {
    const result = await lookupEjendomsvurdering(null, "Test Ejerlav");
    expect(result.ok).toBe(false);
  });

  it("fails without an ejerlav", async () => {
    const result = await lookupEjendomsvurdering("15a", null);
    expect(result.ok).toBe(false);
  });
});

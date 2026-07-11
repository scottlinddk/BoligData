import { describe, expect, it } from "vitest";
import { lookupAddressCadastral } from "./address-lookup.js";

describe("lookupAddressCadastral (mock mode)", () => {
  it("returns a deterministic cadastral record for the same address", async () => {
    const first = await lookupAddressCadastral("Testvej 1", "9000", 57.05, 9.92);
    const second = await lookupAddressCadastral("Testvej 1", "9000", 57.05, 9.92);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
  });

  it("returns different cadastral data for different addresses", async () => {
    const a = await lookupAddressCadastral("Testvej 1", "9000", 57.05, 9.92);
    const b = await lookupAddressCadastral("Andenvej 2", "8000", 56.15, 10.2);
    expect(a).not.toEqual(b);
  });

  it("always returns a valid zone value", async () => {
    const result = await lookupAddressCadastral("Testvej 1", "9000", 57.05, 9.92);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(["byzone", "landzone", "sommerhusomraade"]).toContain(result.data.zone);
    }
  });
});

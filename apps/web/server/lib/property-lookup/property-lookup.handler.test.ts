import { describe, expect, it } from "vitest";
import { lookupProperty } from "./property-lookup.handler.js";
import type { PropertyLookupInput } from "../../../../../packages/shared/src/types/property-lookup.js";

const input: PropertyLookupInput = {
  address: "Skomagergyden 4, 9000 Aalborg",
  postalCode: "9000",
  askingPrice: 2_000_000,
  roomCount: 5,
  energyLabel: "B",
};

describe("lookupProperty (mock mode)", () => {
  it("returns a fully populated result tagged source: ai throughout", async () => {
    const result = await lookupProperty(input);

    expect(result.address).toBe(input.address);
    expect(result.source).toBe("ai");
    expect(result.resolved.idLokalid).not.toBeNull();
    expect(result.bbrData).not.toBeNull();
    expect(result.publicValuation).not.toBeNull();
    expect(result.renovationCategory.source).toBe("ai");
    expect(result.screening).toHaveLength(6);
    for (const criterion of result.screening) {
      expect(criterion.source).toBe("ai");
    }
    expect(result.scoringInputs.source).toBe("ai");
  });

  it("is deterministic for the same address", async () => {
    const first = await lookupProperty(input);
    const second = await lookupProperty(input);
    expect(first).toEqual(second);
  });
});

import { describe, expect, it } from "vitest";
import { lookupBbr } from "./bbr.js";

describe("lookupBbr (mock mode)", () => {
  it("returns deterministic building data for the same id_lokalid", async () => {
    const first = await lookupBbr("test-uuid-1");
    const second = await lookupBbr("test-uuid-1");
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
  });

  it("returns all building fields populated", async () => {
    const result = await lookupBbr("test-uuid-1");
    if (!result.ok) throw new Error("expected ok result");
    expect(result.data.yearBuilt).not.toBeNull();
    expect(result.data.areaSqm).not.toBeNull();
    expect(result.data.buildingType).not.toBeNull();
    expect(result.data.floors).not.toBeNull();
    expect(result.data.roofMaterial).not.toBeNull();
    expect(result.data.wallMaterial).not.toBeNull();
    expect(result.data.heatingInstallation).not.toBeNull();
  });

  it("fails without an id_lokalid", async () => {
    const result = await lookupBbr(null);
    expect(result.ok).toBe(false);
  });
});

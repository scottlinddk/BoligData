import { describe, expect, it } from "vitest";
import { lookupMatrikelParcel } from "./matrikel.js";

describe("lookupMatrikelParcel (mock mode)", () => {
  it("returns a deterministic registered area for the same matrikelnr/ejerlav", async () => {
    const first = await lookupMatrikelParcel("15a", "Test Ejerlav");
    const second = await lookupMatrikelParcel("15a", "Test Ejerlav");
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
  });

  it("fails without a matrikelnr", async () => {
    const result = await lookupMatrikelParcel(null, "Test Ejerlav");
    expect(result.ok).toBe(false);
  });

  it("fails without an ejerlav", async () => {
    const result = await lookupMatrikelParcel("15a", null);
    expect(result.ok).toBe(false);
  });
});

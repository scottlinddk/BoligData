import { describe, expect, it } from "vitest";
import { lookupBbr } from "./bbr.js";

describe("lookupBbr (mock mode)", () => {
  it("returns a deterministic heating installation for the same id_lokalid", async () => {
    const first = await lookupBbr("test-uuid-1");
    const second = await lookupBbr("test-uuid-1");
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
  });

  it("fails without an id_lokalid", async () => {
    const result = await lookupBbr(null);
    expect(result.ok).toBe(false);
  });
});

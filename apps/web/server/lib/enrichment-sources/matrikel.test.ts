import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupMatrikelParcel } from "./matrikel.js";
afterEach(() => vi.unstubAllEnvs());

describe("lookupMatrikelParcel (mock mode)", () => {
  it("returns a deterministic registered area for the same matrikelnr/ejerlav", async () => {
    vi.stubEnv("MATRIKEL_MOCK_MODE", "true");
    const first = await lookupMatrikelParcel("15a", "Test Ejerlav");
    const second = await lookupMatrikelParcel("15a", "Test Ejerlav");
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
  });
  it("reports a missing credential rather than inventing parcel area by default", async () => {
    vi.stubEnv("MATRIKEL_MOCK_MODE", undefined);
    vi.stubEnv("DATAFORDELER_API_KEY", undefined);
    expect(await lookupMatrikelParcel("15a", "Test Ejerlav")).toEqual({ ok: false, error: "DATAFORDELER_API_KEY not configured" });
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

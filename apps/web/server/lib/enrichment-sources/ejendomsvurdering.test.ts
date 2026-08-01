import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupEjendomsvurdering } from "./ejendomsvurdering.js";
import { stubFetch } from "../test-support/stub-fetch.js";

function valuationBody(node: Record<string, unknown> | null) {
  return { data: { VUR_Ejendomsvurdering: { nodes: node === null ? [] : [node] } } };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("lookupEjendomsvurdering (live)", () => {
  it("queries by BFE number when the address register resolved one", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    const stub = stubFetch([
      { body: valuationBody({ ejendomsvaerdi: 3_150_000, grundvaerdi: 780_000, vurderingsaar: 2025 }) },
    ]);

    const result = await lookupEjendomsvurdering("481i", "Sofiendal", "2340871");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      assessedPropertyValueDkk: 3_150_000,
      assessedLandValueDkk: 780_000,
      valuationYear: 2025,
    });
    expect(stub.bodies[0]).toContain("bfeNummer");
    expect(stub.bodies[0]).not.toContain("matrikelnummer");
  });

  it("falls back to matrikelnr/ejerlav when there is no BFE number", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    const stub = stubFetch([{ body: valuationBody({ ejendomsvaerdi: 1_000_000 }) }]);

    await lookupEjendomsvurdering("15a", "Test Ejerlav");
    expect(stub.bodies[0]).toContain("matrikelnummer");
    expect(stub.bodies[0]).toContain("ejerlavsnavn");
  });

  it("reports a GraphQL rejection instead of falling back to a fabricated value", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubFetch([{ body: { errors: [{ message: "Unknown field 'ejendomsvaerdi'" }] } }]);

    const result = await lookupEjendomsvurdering("15a", "Test Ejerlav");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("ejendomsvaerdi");
  });

  it("reports an empty result rather than returning zeroes", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubFetch([{ body: valuationBody(null) }]);

    const result = await lookupEjendomsvurdering(null, null, "2340871");
    expect(result.ok).toBe(false);
  });

  it("fails without a credential", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "");
    const result = await lookupEjendomsvurdering("15a", "Test Ejerlav");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("DATAFORDELER_API_KEY");
  });

  it("fails when there is no key of either kind to query by", async () => {
    expect((await lookupEjendomsvurdering(null, "Test Ejerlav")).ok).toBe(false);
    expect((await lookupEjendomsvurdering("15a", null)).ok).toBe(false);
  });
});

describe("lookupEjendomsvurdering (mock mode)", () => {
  it("returns a deterministic valuation only when the flag is enabled", async () => {
    vi.stubEnv("EJENDOMSVURDERING_MOCK_MODE", "true");
    const first = await lookupEjendomsvurdering("15a", "Test Ejerlav");
    const second = await lookupEjendomsvurdering("15a", "Test Ejerlav");
    expect(first).toEqual(second);
    if (!first.ok) throw new Error("expected ok result");
    expect(first.data.assessedPropertyValueDkk).not.toBeNull();
    expect(first.data.assessedLandValueDkk).not.toBeNull();
    expect(first.data.valuationYear).not.toBeNull();
  });
});

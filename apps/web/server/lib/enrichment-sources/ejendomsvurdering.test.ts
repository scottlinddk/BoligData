import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildQuery, lookupEjendomsvurdering, selectValuationFields } from "./ejendomsvurdering.js";
import { resetDatafordelerCache } from "./datafordeler.js";
import { stubFetch } from "../test-support/stub-fetch.js";

const SCHEMA_FIELDS = ["bfeNummer", "ejendomsvaerdi", "grundvaerdi", "vurderingsaar", "kommunekode"];

function valuationBody(node: Record<string, unknown> | null) {
  return { data: { VUR_Ejendomsvurdering: { nodes: node === null ? [] : [node] } } };
}

/** Reply to the schema introspection that resolves the register's own field spellings. */
function introspection(fields: string[]) {
  return { data: { __type: { fields: fields.map((name) => ({ name })) } } };
}

beforeEach(() => {
  resetDatafordelerCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("selectValuationFields", () => {
  it("resolves the register's own spelling rather than this repo's guess", () => {
    const fields = selectValuationFields(
      new Set(["ejendomsvaerdiBeloeb", "grundvaerdiBeloeb", "vurderingsaar", "grundvaerdiOmraadeKode"]),
    );
    expect(fields).toEqual({
      assessedValue: "ejendomsvaerdiBeloeb",
      landValue: "grundvaerdiBeloeb",
      year: "vurderingsaar",
    });
  });

  it("does not mistake a field that merely mentions the term for the value itself", () => {
    const fields = selectValuationFields(new Set(["omraadeGrundvaerdiKode", "kommunekode"]));
    expect(fields.assessedValue).toBeNull();
    expect(fields.landValue).toBeNull();
  });
});

describe("buildQuery", () => {
  it("sends no bitemporal arguments — VUR's query field has none", () => {
    const query = buildQuery(
      { matrikelnr: null, ejerlav: null, bfeNummer: "2340871" },
      { assessedValue: "ejendomsvaerdi", landValue: "grundvaerdi", year: "vurderingsaar" },
    );
    expect(query).not.toContain("registreringstid");
    expect(query).not.toContain("virkningstid");
  });

  it("selects only the values the schema actually carries", () => {
    const query = buildQuery(
      { matrikelnr: null, ejerlav: null, bfeNummer: "2340871" },
      { assessedValue: "ejendomsvaerdi", landValue: null, year: null },
    );
    expect(query).toContain("ejendomsvaerdi");
    expect(query).not.toContain("grundvaerdi");
  });
});

describe("lookupEjendomsvurdering (live)", () => {
  it("queries by BFE number when the address register resolved one", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    const stub = stubFetch([
      { body: introspection(SCHEMA_FIELDS) },
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
    expect(stub.bodies[1]).toContain("bfeNummer");
    expect(stub.bodies[1]).not.toContain("matrikelnummer");
  });

  it("reads the values under the names the live schema uses", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    const stub = stubFetch([
      { body: introspection(["ejendomsvaerdiBeloeb", "grundvaerdiBeloeb", "vurderingsaar"]) },
      { body: valuationBody({ ejendomsvaerdiBeloeb: 2_000_000, grundvaerdiBeloeb: 500_000, vurderingsaar: 2023 }) },
    ]);

    const result = await lookupEjendomsvurdering(null, null, "2340871");
    expect(stub.bodies[1]).toContain("ejendomsvaerdiBeloeb");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.assessedPropertyValueDkk).toBe(2_000_000);
    expect(result.data.assessedLandValueDkk).toBe(500_000);
  });

  it("names the available fields when the schema carries no assessed value", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    const stub = stubFetch([{ body: introspection(["kommunekode", "bfeNummer"]) }]);

    const result = await lookupEjendomsvurdering(null, null, "2340871");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("kommunekode");
    // Nothing is queried once it is known the schema can't answer.
    expect(stub.urls).toHaveLength(1);
  });

  it("falls back to matrikelnr/ejerlav when there is no BFE number", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    const stub = stubFetch([
      { body: introspection(SCHEMA_FIELDS) },
      { body: valuationBody({ ejendomsvaerdi: 1_000_000 }) },
    ]);

    await lookupEjendomsvurdering("15a", "Test Ejerlav");
    expect(stub.bodies[1]).toContain("matrikelnummer");
    expect(stub.bodies[1]).toContain("ejerlavsnavn");
  });

  it("reports a GraphQL rejection instead of falling back to a fabricated value", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubFetch([
      { body: introspection(SCHEMA_FIELDS) },
      { body: { errors: [{ message: "Unknown field 'ejendomsvaerdi'" }] } },
    ]);

    const result = await lookupEjendomsvurdering("15a", "Test Ejerlav");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("ejendomsvaerdi");
  });

  it("reports an empty result rather than returning zeroes", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubFetch([{ body: introspection(SCHEMA_FIELDS) }, { body: valuationBody(null) }]);

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

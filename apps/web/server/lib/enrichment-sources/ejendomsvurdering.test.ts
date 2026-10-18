import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupEjendomsvurdering, valuationFromYears } from "./ejendomsvurdering.js";
import { resetDatafordelerCache } from "./datafordeler.js";

const HUSNUMMER = "0a3f509c-38ed-32b8-e044-0003ba298018";

type Handler = () => { nodes: unknown[]; hasNextPage?: boolean };

/** A fake Datafordeler: one handler per entity, and a record of every document and URL sent. */
function fakeDatafordeler(handlers: Record<string, Handler>) {
  const queries: string[] = [];
  const urls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((async (url: unknown, init?: { body?: unknown }) => {
    const query = JSON.parse(String(init?.body)).query as string;
    queries.push(query);
    urls.push(String(url));
    const entity = query.match(/query Q \{ (\w+)/)?.[1] ?? "";
    const result = handlers[entity]?.() ?? { nodes: [] };
    const connection = { nodes: result.nodes, ...(result.hasNextPage === undefined ? {} : { pageInfo: { hasNextPage: result.hasNextPage } }) };
    return { ok: true, status: 200, headers: new Headers(), json: async () => ({ data: { [entity]: connection } }) };
  }) as unknown as typeof fetch);
  return { queries, urls };
}

const vur = (year: number, assessed: number, land: number) => ({
  id: year * 1000, aar: year, ejendomvaerdiBeloeb: assessed, grundvaerdiBeloeb: land,
  ajourfoeringDato: `${year + 1}-03-01T00:00:00Z`, VURMark: 3, aendringDato: `${year}-12-31`,
});

const valuations: Record<string, Handler> = {
  VUR_BFEKrydsreference: () => ({ nodes: [{ fkEjendomsvurderingID: 2_022_000 }, { fkEjendomsvurderingID: 2_024_000 }] }),
  VUR_Ejendomsvurdering: () => ({ nodes: [vur(2022, 2_900_000, 700_000), vur(2024, 3_150_000, 780_000)] }),
};

beforeEach(() => {
  resetDatafordelerCache();
  vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
  vi.stubEnv("EJENDOMSVURDERING_MOCK_MODE", "");
  vi.stubEnv("DATAFORDELER_VUR_VERSION", "");
  vi.stubEnv("DATAFORDELER_VUR_API_BASE", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("valuationFromYears", () => {
  it("takes the latest year with a property value, and the year before it", () => {
    expect(
      valuationFromYears([
        { year: 2022, propertyValueDkk: 2_900_000, landValueDkk: 700_000, registeredAt: null },
        { year: 2024, propertyValueDkk: 3_150_000, landValueDkk: 780_000, registeredAt: null },
      ]),
    ).toEqual({ assessedPropertyValueDkk: 3_150_000, assessedLandValueDkk: 780_000, valuationYear: 2024, previousYear: 2022, previousPropertyValueDkk: 2_900_000 });
  });

  it("skips a year that has only a land value, and leaves the previous year empty when there is one year", () => {
    const result = valuationFromYears([
      { year: 2022, propertyValueDkk: null, landValueDkk: 700_000, registeredAt: null },
      { year: 2024, propertyValueDkk: 3_150_000, landValueDkk: 780_000, registeredAt: null },
    ]);
    expect(result).toMatchObject({ valuationYear: 2024, previousYear: null, previousPropertyValueDkk: null });
  });

  it("is null when no year has a property value", () => {
    expect(valuationFromYears([])).toBeNull();
    expect(valuationFromYears([{ year: 2024, propertyValueDkk: null, landValueDkk: 1, registeredAt: null }])).toBeNull();
  });
});

describe("lookupEjendomsvurdering (live)", () => {
  it("reads a known BFE from VUR/v2 with no schema introspection, which Datafordeler has switched off", async () => {
    const { queries, urls } = fakeDatafordeler(valuations);
    const result = await lookupEjendomsvurdering({ bfeNummer: "2340871" });

    expect(result).toEqual({
      ok: true,
      data: { assessedPropertyValueDkk: 3_150_000, assessedLandValueDkk: 780_000, valuationYear: 2024, previousYear: 2022, previousPropertyValueDkk: 2_900_000 },
    });
    expect(urls.every((url) => url.includes("graphql.datafordeler.dk/VUR/v2"))).toBe(true);
    expect(queries.some((q) => q.includes("__type"))).toBe(false);
    expect(queries[0]).toContain("BFEnummer: { eq: 2340871 }");
  });

  it("finds a house's BFE from its husnummer when there is none", async () => {
    const { queries } = fakeDatafordeler({
      BBR_Bygning: () => ({ nodes: [{ byg021BygningensAnvendelse: 120 }], hasNextPage: false }),
      BBR_Grund: () => ({ nodes: [{ id_lokalId: "g1", bestemtFastEjendom: "rel-1" }] }),
      BBR_Ejendomsrelation: () => ({ nodes: [{ bfeNummer: 5_000_001 }] }),
      ...valuations,
    });
    const result = await lookupEjendomsvurdering({ husnummerId: HUSNUMMER });
    expect(result).toMatchObject({ ok: true, data: { valuationYear: 2024 } });
    expect(queries.find((q) => q.includes("VUR_BFEKrydsreference"))).toContain("BFEnummer: { eq: 5000001 }");
  });

  it("prefers a BFE the caller holds over walking BBR from the husnummer", async () => {
    const { queries } = fakeDatafordeler(valuations);
    await lookupEjendomsvurdering({ husnummerId: HUSNUMMER, bfeNummer: "2340871" });
    expect(queries.some((q) => q.includes("BBR_"))).toBe(false);
  });

  it("says why a matrikelnr and ejerlav alone cannot be looked up", async () => {
    expect(await lookupEjendomsvurdering({ matrikelnr: "42q", ejerlav: "Hasseris" })).toMatchObject({ ok: false, error: expect.stringContaining("keyed by BFE") });
    expect(await lookupEjendomsvurdering({})).toMatchObject({ ok: false, error: "no husnummer or BFE number to look up" });
  });

  it("reports a missing credential, an unknown BFE and a rejected document instead of inventing a value", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "");
    expect(await lookupEjendomsvurdering({ bfeNummer: "2340871" })).toEqual({ ok: false, error: "DATAFORDELER_API_KEY not configured" });

    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    fakeDatafordeler({ VUR_BFEKrydsreference: () => ({ nodes: [] }) });
    expect(await lookupEjendomsvurdering({ bfeNummer: "2340871" })).toEqual({ ok: false, error: "no valuation registered for BFE 2340871" });

    vi.spyOn(globalThis, "fetch").mockImplementation((async () => ({
      ok: true, status: 200, headers: new Headers(), json: async () => ({ errors: [{ message: "Field `x` does not exist" }] }),
    })) as unknown as typeof fetch);
    const rejected = await lookupEjendomsvurdering({ bfeNummer: "2340871" });
    expect(rejected).toMatchObject({ ok: false, error: expect.stringContaining("does not exist") });
  });
});

describe("lookupEjendomsvurdering (mock mode)", () => {
  it("returns a deterministic valuation only when the flag is enabled", async () => {
    vi.stubEnv("EJENDOMSVURDERING_MOCK_MODE", "true");
    const first = await lookupEjendomsvurdering({ bfeNummer: "2340871" });
    expect(first).toEqual(await lookupEjendomsvurdering({ bfeNummer: "2340871" }));
    expect(first.ok).toBe(true);
  });
});

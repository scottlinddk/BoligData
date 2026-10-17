import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildValuationYears,
  classifyHusnummer,
  isoTimestamp,
  lookupHouseBfe,
  lookupHouseValuation,
  lookupValuationYears,
  positiveInt,
  registerId,
} from "./vur-valuations.js";
import { resetDatafordelerCache } from "./datafordeler.js";

const HUSNUMMER = "0a3f509c-38ed-32b8-e044-0003ba298018";
const RELATION = "0a3f50f5-1111-4222-8333-444455556666";

type Handler = (query: string) => { nodes: unknown[]; hasNextPage?: boolean };

/** A fake Datafordeler: one handler per entity, and a record of every document sent. */
function fakeDatafordeler(handlers: Record<string, Handler>) {
  const queries: string[] = [];
  const urls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((async (url: unknown, init?: { body?: unknown }) => {
    const query = JSON.parse(String(init?.body)).query as string;
    queries.push(query);
    urls.push(String(url));
    const entity = query.match(/query Q \{ (\w+)/)?.[1] ?? "";
    const result = handlers[entity]?.(query) ?? { nodes: [] };
    const connection = { nodes: result.nodes, ...(result.hasNextPage === undefined ? {} : { pageInfo: { hasNextPage: result.hasNextPage } }) };
    return { ok: true, status: 200, headers: new Headers(), json: async () => ({ data: { [entity]: connection } }) };
  }) as unknown as typeof fetch);
  return { queries, urls };
}

const vur = (year: number, assessed: number, land: number, extra: Record<string, unknown> = {}) => ({
  id: year * 1000, aar: year, ejendomvaerdiBeloeb: assessed, grundvaerdiBeloeb: land,
  ajourfoeringDato: `${year + 1}-03-01T00:00:00Z`, VURMark: 3, aendringDato: `${year}-12-31`, ...extra,
});

beforeEach(() => {
  resetDatafordelerCache();
  vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("helpers", () => {
  it("reads register ids as exact integers only", () => {
    expect(registerId("900000000000001")).toBe(900000000000001);
    expect(registerId(12)).toBe(12);
    for (const bad of ["1.5", "abc", -1, 0, 2 ** 60, null]) expect(registerId(bad)).toBeNull();
  });

  it("caps amounts and rejects non-numbers", () => {
    expect(positiveInt("3150000")).toBe(3_150_000);
    expect(positiveInt(2.6)).toBe(3);
    for (const bad of [0, -5, 1e13, "", "x", null]) expect(positiveInt(bad)).toBeNull();
  });

  it("never treats a future or pre-1990 date as known", () => {
    expect(isoTimestamp("2022-11-01T00:00:00Z", Date.UTC(2026, 0, 1))).toBe("2022-11-01T00:00:00.000Z");
    expect(isoTimestamp("2999-01-01T00:00:00Z")).toBeNull();
    expect(isoTimestamp("1980-01-01T00:00:00Z")).toBeNull();
    expect(isoTimestamp("not a date")).toBeNull();
    expect(isoTimestamp(undefined)).toBeNull();
  });
});

describe("buildValuationYears", () => {
  const now = Date.UTC(2026, 9, 17);

  it("prefers the new system, then the latest change date, and keeps the earliest registration of the winning value", () => {
    const { years, conflictYears } = buildValuationYears([
      vur(2024, 500, 50, { ajourfoeringDato: "2025-06-01T00:00:00Z" }),
      vur(2024, 500, 50, { ajourfoeringDato: "2025-02-01T00:00:00Z" }), // same value, earlier registration wins
      vur(2022, 400, 40, { VURMark: 1 }), // old system, before the cutoff year: usable
      vur(2022, 450, 45, { VURMark: 3 }), // new system beats the old one in the same year
    ], now);
    expect(conflictYears).toBe(0);
    expect(years).toEqual([
      { year: 2022, propertyValueDkk: 450, landValueDkk: 45, registeredAt: "2023-03-01T00:00:00.000Z" },
      { year: 2024, propertyValueDkk: 500, landValueDkk: 50, registeredAt: "2025-02-01T00:00:00.000Z" },
    ]);
  });

  it("drops old-system rows from 2020 on, which would be set against new-system values", () => {
    const { years } = buildValuationYears([vur(2021, 881_000, 100_000, { VURMark: 1 }), vur(2019, 700_000, 90_000, { VURMark: 1 })], now);
    expect(years.map((y) => y.year)).toEqual([2019]);
  });

  it("drops conflicting years and invalid rows, and counts the conflicts", () => {
    const { years, conflictYears } = buildValuationYears([
      vur(2022, 100, 10), vur(2022, 100, 10), // identical duplicate is fine
      vur(2024, 200, 20, { aendringDato: "2024-12-31" }), vur(2024, 999, 20, { aendringDato: "2024-12-31" }), // same system and date, different value
      vur(1800, 1, 1), // out of range
      { id: 1, aar: 2026, ejendomvaerdiBeloeb: null, grundvaerdiBeloeb: null, VURMark: 3 }, // nothing usable
    ], now);
    expect(years.map((y) => y.year)).toEqual([2022]);
    expect(conflictYears).toBe(1);
  });

  it("leaves the registration date null when the register gives no usable one", () => {
    const { years } = buildValuationYears([vur(2024, 200, 20, { ajourfoeringDato: "not a date" }), vur(2026, 300, 30, { ajourfoeringDato: "2999-01-01T00:00:00Z" })], now);
    expect(years.map((y) => y.registeredAt)).toEqual([null, null]);
  });
});

describe("classifyHusnummer", () => {
  const buildings = (...uses: unknown[]) => ({ nodes: uses.map((use) => ({ byg021BygningensAnvendelse: use })), hasNextPage: false });

  it("calls a house with a garage and a shed a house, so outbuildings do not block it", async () => {
    fakeDatafordeler({ BBR_Bygning: () => buildings(120, 910, "930") });
    expect(await classifyHusnummer(HUSNUMMER)).toEqual({ ok: true, data: "house" });
  });

  it("calls any building with several households 'other', even next to a house code", async () => {
    fakeDatafordeler({ BBR_Bygning: () => buildings(140, 120) });
    expect(await classifyHusnummer(HUSNUMMER)).toEqual({ ok: true, data: "other" });
  });

  it("calls a summer house or a garage-only parcel 'other'", async () => {
    fakeDatafordeler({ BBR_Bygning: () => buildings(510) });
    expect(await classifyHusnummer(HUSNUMMER)).toEqual({ ok: true, data: "other" });
    fakeDatafordeler({ BBR_Bygning: () => buildings(910) });
    expect(await classifyHusnummer(HUSNUMMER)).toEqual({ ok: true, data: "other" });
  });

  it("asks only for built buildings on this husnummer, with the temporal arguments BBR requires", async () => {
    const { queries, urls } = fakeDatafordeler({ BBR_Bygning: () => buildings(120) });
    await classifyHusnummer(HUSNUMMER.toUpperCase());
    expect(queries[0]).toMatch(/BBR_Bygning\(registreringstid: ".+" virkningstid: ".+" first: 50 where: \{ husnummer: \{ eq: "0a3f509c-38ed-32b8-e044-0003ba298018" \}, status: \{ eq: "6" \} \}\)/);
    expect(queries[0]).toContain("pageInfo { hasNextPage }");
    expect(urls[0]).toContain("/BBR/");
  });

  it("refuses to decide from an incomplete list", async () => {
    fakeDatafordeler({ BBR_Bygning: () => ({ nodes: [{ byg021BygningensAnvendelse: 120 }], hasNextPage: true }) });
    const result = await classifyHusnummer(HUSNUMMER);
    expect(result.ok).toBe(false);
  });

  it("fails with a reason when there is no building, no use code, no key or a bad id", async () => {
    fakeDatafordeler({ BBR_Bygning: () => ({ nodes: [], hasNextPage: false }) });
    expect(await classifyHusnummer(HUSNUMMER)).toMatchObject({ ok: false, error: expect.stringContaining("no current built BBR building") });
    fakeDatafordeler({ BBR_Bygning: () => buildings(null) });
    expect(await classifyHusnummer(HUSNUMMER)).toMatchObject({ ok: false, error: expect.stringContaining("no building use") });
    expect(await classifyHusnummer("../x")).toMatchObject({ ok: false });
    vi.stubEnv("DATAFORDELER_API_KEY", "");
    expect(await classifyHusnummer(HUSNUMMER)).toEqual({ ok: false, error: "DATAFORDELER_API_KEY not configured" });
  });
});

describe("lookupHouseBfe", () => {
  it("follows husnummer -> grund -> ejendomsrelation, and reads the BFE number as a Long", async () => {
    const { queries } = fakeDatafordeler({
      BBR_Grund: () => ({ nodes: [{ id_lokalId: "g1", bestemtFastEjendom: RELATION }] }),
      BBR_Ejendomsrelation: () => ({ nodes: [{ id_lokalId: RELATION, bfeNummer: 5_000_001 }] }),
    });
    expect(await lookupHouseBfe(HUSNUMMER)).toEqual({ ok: true, data: "5000001" });
    expect(queries[0]).toContain(`BBR_Grund(registreringstid:`);
    expect(queries[0]).toContain(`where: { husnummer: { eq: "${HUSNUMMER}" } }`);
    expect(queries[1]).toContain(`BBR_Ejendomsrelation(registreringstid:`);
    expect(queries[1]).toContain(`where: { id_lokalId: { eq: "${RELATION}" } }`);
    expect(queries[1]).toContain("id_lokalId bfeNummer");
  });

  it("names the hop that has no answer", async () => {
    fakeDatafordeler({});
    expect(await lookupHouseBfe(HUSNUMMER)).toEqual({ ok: false, error: "no BBR_Grund on this husnummer" });
    fakeDatafordeler({ BBR_Grund: () => ({ nodes: [{ id_lokalId: "g1", bestemtFastEjendom: null }] }) });
    expect(await lookupHouseBfe(HUSNUMMER)).toEqual({ ok: false, error: "BBR_Grund has no bestemtFastEjendom reference" });
    fakeDatafordeler({ BBR_Grund: () => ({ nodes: [{ id_lokalId: "g1", bestemtFastEjendom: RELATION }] }) });
    expect(await lookupHouseBfe(HUSNUMMER)).toEqual({ ok: false, error: "no BFE number in the register response" });
  });

  it("refuses to pick between several BFE numbers", async () => {
    fakeDatafordeler({
      BBR_Grund: () => ({ nodes: [{ bestemtFastEjendom: RELATION }] }),
      BBR_Ejendomsrelation: () => ({ nodes: [{ bfeNummer: 1 }, { bfeNummer: 2 }] }),
    });
    expect(await lookupHouseBfe(HUSNUMMER)).toEqual({ ok: false, error: "ambiguous: several BFE numbers (1, 2)" });
  });
});

describe("lookupValuationYears", () => {
  const handlers = (rows: unknown[], refs: unknown[] = [{ fkEjendomsvurderingID: 2_024_000 }, { fkEjendomsvurderingID: "2022000" }]) => ({
    VUR_BFEKrydsreference: () => ({ nodes: refs }),
    VUR_Ejendomsvurdering: () => ({ nodes: rows }),
  });

  it("queries the cross-reference by numeric BFE and the valuations by id, with no temporal arguments", async () => {
    const { queries, urls } = fakeDatafordeler(handlers([vur(2022, 400, 40), vur(2024, 500, 50)]));
    const result = await lookupValuationYears("5000001");
    expect(result.ok && result.data.map((y) => y.year)).toEqual([2022, 2024]);
    expect(queries[0]).toContain("VUR_BFEKrydsreference(first: 50 where: { BFEnummer: { eq: 5000001 } })");
    expect(queries[0]).not.toContain("registreringstid");
    expect(queries[1]).toContain("VUR_Ejendomsvurdering(first: 50 where: { id: { in: [2024000, 2022000] } })");
    expect(queries[1]).not.toContain("registreringstid");
    for (const field of ["aar", "ejendomvaerdiBeloeb", "grundvaerdiBeloeb", "ajourfoeringDato", "VURMark", "aendringDato"]) expect(queries[1]).toContain(field);
    expect(urls[0]).toContain("/VUR/");
  });

  it("refuses a full page rather than keep a truncated list", async () => {
    const refs = Array.from({ length: 50 }, (_, i) => ({ fkEjendomsvurderingID: i + 1 }));
    fakeDatafordeler(handlers([], refs));
    expect(await lookupValuationYears("5000001")).toMatchObject({ ok: false, error: expect.stringContaining("more than one page") });
  });

  it("fails with a reason for an unknown BFE, an unusable BFE and all-conflicting years", async () => {
    fakeDatafordeler(handlers([], []));
    expect(await lookupValuationYears("5000001")).toEqual({ ok: false, error: "no valuation registered for BFE 5000001" });
    expect(await lookupValuationYears("abc")).toEqual({ ok: false, error: "not a valid BFE number" });
    fakeDatafordeler(handlers([vur(2024, 1, 1), vur(2024, 2, 1)]));
    expect(await lookupValuationYears("5000001")).toEqual({ ok: false, error: "every valuation year had conflicting values" });
  });
});

describe("lookupHouseValuation", () => {
  const house = {
    BBR_Bygning: () => ({ nodes: [{ byg021BygningensAnvendelse: 120 }], hasNextPage: false }),
    BBR_Grund: () => ({ nodes: [{ bestemtFastEjendom: RELATION }] }),
    BBR_Ejendomsrelation: () => ({ nodes: [{ bfeNummer: 5_000_001 }] }),
    VUR_BFEKrydsreference: () => ({ nodes: [{ fkEjendomsvurderingID: 2_024_000 }] }),
    VUR_Ejendomsvurdering: () => ({ nodes: [vur(2024, 3_150_000, 780_000)] }),
  };

  it("resolves a house all the way to its valuations", async () => {
    fakeDatafordeler(house);
    const result = await lookupHouseValuation(HUSNUMMER);
    expect(result.propertyClass).toBe("house");
    expect(result.bfeNummer).toBe("5000001");
    expect(result.valuation).toEqual({
      ok: true,
      data: [{ year: 2024, propertyValueDkk: 3_150_000, landValueDkk: 780_000, registeredAt: "2025-03-01T00:00:00.000Z" }],
    });
  });

  it("never looks up a BFE or valuation for an apartment building", async () => {
    const { queries } = fakeDatafordeler({ ...house, BBR_Bygning: () => ({ nodes: [{ byg021BygningensAnvendelse: 140 }], hasNextPage: false }) });
    const result = await lookupHouseValuation(HUSNUMMER);
    expect(result.propertyClass).toBe("other");
    expect(result.valuation).toMatchObject({ ok: false, error: expect.stringContaining("not a house") });
    expect(queries).toHaveLength(1);
  });

  it("says which hop failed", async () => {
    fakeDatafordeler({ ...house, BBR_Grund: () => ({ nodes: [] }) });
    expect(await lookupHouseValuation(HUSNUMMER)).toEqual({ propertyClass: "house", bfeNummer: null, valuation: { ok: false, error: "bfe: no BBR_Grund on this husnummer" } });
    // The BFE was found, so it is kept even though the valuation hop after it failed.
    fakeDatafordeler({ ...house, VUR_BFEKrydsreference: () => ({ nodes: [] }) });
    expect(await lookupHouseValuation(HUSNUMMER)).toEqual({ propertyClass: "house", bfeNummer: "5000001", valuation: { ok: false, error: "valuation: no valuation registered for BFE 5000001" } });
    fakeDatafordeler({ ...house, BBR_Bygning: () => ({ nodes: [], hasNextPage: false }) });
    expect(await lookupHouseValuation(HUSNUMMER)).toMatchObject({ propertyClass: null, bfeNummer: null, valuation: { ok: false, error: expect.stringContaining("building use:") } });
  });

  it("does nothing without a husnummer id", async () => {
    const { queries } = fakeDatafordeler(house);
    expect(await lookupHouseValuation(null)).toEqual({ propertyClass: null, bfeNummer: null, valuation: { ok: false, error: "no husnummer id to look up" } });
    expect(queries).toHaveLength(0);
  });
});

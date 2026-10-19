import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildEstateQuery, buildParcelsQuery, lookupLand, lookupMatrikel, mapLandRegistration } from "./matrikel.js";
import { resetDatafordelerCache } from "./datafordeler.js";

const ESTATE_ID = "11111111-2222-4333-8444-555555555555";

type Handler = (query: string) => { nodes: unknown[]; hasNextPage?: boolean };

/** A fake Datafordeler: one handler per entity, and a record of every document and URL sent. */
function fakeDatafordeler(handlers: Record<string, Handler>) {
  const queries: string[] = [];
  const urls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((async (url: unknown, init?: { body?: unknown }) => {
    const query = JSON.parse(String(init?.body)).query as string;
    queries.push(query);
    urls.push(String(url));
    const entity = query.match(/\{\s+(\w+)\(/)?.[1] ?? "";
    const result = handlers[entity]?.(query) ?? { nodes: [] };
    const connection = { nodes: result.nodes, ...(result.hasNextPage === undefined ? {} : { pageInfo: { hasNextPage: result.hasNextPage } }) };
    return { ok: true, status: 200, headers: new Headers(), json: async () => ({ data: { [entity]: connection } }) };
  }) as unknown as typeof fetch);
  return { queries, urls };
}

const estate = { id_lokalId: ESTATE_ID, BFEnummer: 2340871, landbrugsnotering: null, erFaelleslod: false, hovedejendomOpdeltIEjerlejligh: false };
const parcel = (extra: Record<string, unknown> = {}) => ({
  id_lokalId: "p1", registreretAreal: 812, fredskov_areal: null, strandbeskyttelse_areal: null, klitfredning_areal: null,
  majoratsskov_nummer: null, faelleslod: false, ...extra,
});

const registers = (parcels: unknown[] = [parcel()], estates: unknown[] = [estate]): Record<string, Handler> => ({
  MAT_SamletFastEjendom: () => ({ nodes: estates }),
  MAT_Jordstykke: () => ({ nodes: parcels, hasNextPage: false }),
});

beforeEach(() => {
  resetDatafordelerCache();
  vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
  vi.stubEnv("MATRIKEL_MOCK_MODE", "");
  vi.stubEnv("DATAFORDELER_MAT_VERSION", "");
  vi.stubEnv("DATAFORDELER_MAT_API_BASE", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("queries", () => {
  it("ask MAT for the BFE as a bare number, with both temporal arguments and the MAT status spelling", () => {
    const query = buildEstateQuery("2340871");
    expect(query).toContain("BFEnummer: { eq: 2340871 }");
    expect(query).toContain('status: { eq: "Gældende" }');
    expect(query).toMatch(/registreringstid: "[^"]+" virkningstid: "[^"]+"/);
  });

  it("select only fields the published MAT schema defines", () => {
    const query = buildParcelsQuery('samletFastEjendomLokalId: { eq: "x" }');
    for (const field of ["registreretAreal", "fredskov_areal", "strandbeskyttelse_areal", "klitfredning_areal", "majoratsskov_nummer", "faelleslod"]) {
      expect(query).toContain(field);
    }
    expect(query).not.toContain("ejerlavsnavn");
  });
});

describe("mapLandRegistration", () => {
  it("sums area and reports the protections that carry an area", () => {
    const land = mapLandRegistration(
      [parcel({ registreretAreal: 1000, fredskov_areal: 300 }), parcel({ registreretAreal: 500, fredskov_areal: 200, klitfredning_areal: 50 })],
      true,
      { ...estate, landbrugsnotering: "Landbrug" },
    );
    expect(land).toMatchObject({
      totalAreaSqm: 1500,
      parcelCount: 2,
      forestReserve: { areaSqm: 500 },
      beachProtection: null,
      duneProtection: { areaSqm: 50 },
      entailedForest: false,
      agriculturalNote: "Landbrug",
    });
  });

  it("does not read a zero or missing area as a restriction", () => {
    const land = mapLandRegistration([parcel({ fredskov_areal: 0, strandbeskyttelse_areal: null })], true, estate);
    expect(land.forestReserve).toBeNull();
    expect(land.beachProtection).toBeNull();
  });

  it("flags entailed forest from the majoratsskov number", () => {
    expect(mapLandRegistration([parcel({ majoratsskov_nummer: 12 })], true, estate).entailedForest).toBe(true);
  });

  it("leaves the total unknown when a parcel has no area or the list is incomplete", () => {
    expect(mapLandRegistration([parcel(), parcel({ registreretAreal: null })], true, estate).totalAreaSqm).toBeNull();
    expect(mapLandRegistration([parcel()], false, estate).totalAreaSqm).toBeNull();
  });

  it("carries the common-lot and condominium markers", () => {
    expect(mapLandRegistration([parcel()], true, { ...estate, erFaelleslod: true, hovedejendomOpdeltIEjerlejligh: true })).toMatchObject({ commonLot: true, condominiumParent: true });
  });
});

describe("lookupMatrikel", () => {
  it("resolves BFE -> estate -> parcels against MAT, not the old Matrikel register", async () => {
    const { queries, urls } = fakeDatafordeler(registers());
    const result = await lookupMatrikel({ bfeNummer: "2340871", matrikelnr: null, ejerlavskode: null });

    expect(result).toMatchObject({ ok: true, data: { totalAreaSqm: 812, parcelCount: 1, forestReserve: null } });
    expect(urls[0]).toContain("graphql.datafordeler.dk/MAT/v3");
    expect(queries[0]).toContain("MAT_SamletFastEjendom");
    expect(queries[1]).toContain(`samletFastEjendomLokalId: { eq: "${ESTATE_ID}" }`);
  });

  it("walks to MAT/v2 when v3 is gone, rather than reporting the register down", async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((async (url: unknown) => {
      urls.push(String(url));
      if (String(url).includes("/MAT/v3")) return { ok: false, status: 404, headers: new Headers(), json: async () => ({}) };
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ data: { MAT_SamletFastEjendom: { nodes: [] } } }) };
    }) as unknown as typeof fetch);
    await lookupMatrikel({ bfeNummer: "2340871", matrikelnr: null, ejerlavskode: null });
    expect(urls.some((u) => u.includes("/MAT/v2"))).toBe(true);
  });

  it("finds a single parcel by matrikelnr and ejerlavskode when there is no BFE", async () => {
    const { queries } = fakeDatafordeler(registers());
    const result = await lookupMatrikel({ bfeNummer: null, matrikelnr: "42q", ejerlavskode: "610452" });
    expect(result.ok).toBe(true);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('matrikelnummer: { eq: "42q" }');
    expect(queries[0]).toContain('ejerlavLokalId: { eq: "610452" }');
  });

  it("says why when the BFE has no estate of its own (an apartment)", async () => {
    fakeDatafordeler(registers([parcel()], []));
    expect(await lookupMatrikel({ bfeNummer: "2340871", matrikelnr: null, ejerlavskode: null })).toMatchObject({
      ok: false, error: expect.stringContaining("no current samlet fast ejendom"),
    });
  });

  it("refuses a parcel list it cannot show is complete", async () => {
    fakeDatafordeler({ ...registers(), MAT_Jordstykke: () => ({ nodes: [parcel()], hasNextPage: true }) });
    expect(await lookupMatrikel({ bfeNummer: "2340871", matrikelnr: null, ejerlavskode: null })).toMatchObject({ ok: false, error: expect.stringContaining("truncated") });
    fakeDatafordeler({ ...registers(), MAT_Jordstykke: () => ({ nodes: [parcel()] }) });
    expect((await lookupMatrikel({ bfeNummer: "2340871", matrikelnr: null, ejerlavskode: null })).ok).toBe(false);
  });

  it("fails without a key of either kind, without a credential, and on an unusable BFE", async () => {
    expect((await lookupMatrikel({ bfeNummer: null, matrikelnr: "42q", ejerlavskode: null })).ok).toBe(false);
    expect((await lookupMatrikel({ bfeNummer: "not-a-number", matrikelnr: null, ejerlavskode: null })).ok).toBe(false);
    vi.stubEnv("DATAFORDELER_API_KEY", "");
    expect(await lookupMatrikel({ bfeNummer: "2340871", matrikelnr: null, ejerlavskode: null })).toEqual({ ok: false, error: "DATAFORDELER_API_KEY not configured" });
  });

  it("serves a deterministic mock only when the flag is set, never by default", async () => {
    vi.stubEnv("MATRIKEL_MOCK_MODE", "true");
    const first = await lookupMatrikel({ bfeNummer: "2340871", matrikelnr: null, ejerlavskode: null });
    expect(first).toEqual(await lookupMatrikel({ bfeNummer: "2340871", matrikelnr: null, ejerlavskode: null }));
    expect(first.ok).toBe(true);
  });
});

describe("lookupLand", () => {
  const HUSNUMMER = "0a3f509c-38ed-32b8-e044-0003ba298018";
  const house = {
    BBR_Bygning: () => ({ nodes: [{ byg021BygningensAnvendelse: 120 }], hasNextPage: false }),
    BBR_Grund: () => ({ nodes: [{ id_lokalId: "g1", bestemtFastEjendom: "rel-1" }] }),
    BBR_Ejendomsrelation: () => ({ nodes: [{ bfeNummer: 5_000_001 }] }),
    ...registers(),
  };

  /** The BBR hops use `query Q { Entity(` and MAT's named queries `query Samlet { Entity(`; both match one pattern. */
  it("finds a house's BFE through BBR and reads its land from MAT", async () => {
    const { queries } = fakeDatafordeler(house);
    const result = await lookupLand({ husnummerId: HUSNUMMER, bfeNummer: null, matrikelnr: null, ejerlavskode: null });
    expect(result).toMatchObject({ ok: true, data: { totalAreaSqm: 812 } });
    expect(queries.find((q) => q.includes("MAT_SamletFastEjendom"))).toContain("BFEnummer: { eq: 5000001 }");
  });

  it("uses a BFE the caller holds without walking BBR", async () => {
    const { queries } = fakeDatafordeler(house);
    await lookupLand({ husnummerId: HUSNUMMER, bfeNummer: "2340871", matrikelnr: null, ejerlavskode: null });
    expect(queries.some((q) => q.includes("BBR_"))).toBe(false);
  });

  it("does not read an apartment building's parcel as the apartment's land", async () => {
    const { queries } = fakeDatafordeler({ ...house, BBR_Bygning: () => ({ nodes: [{ byg021BygningensAnvendelse: 140 }], hasNextPage: false }) });
    const result = await lookupLand({ husnummerId: HUSNUMMER, bfeNummer: null, matrikelnr: null, ejerlavskode: null });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("not a house") });
    expect(queries.some((q) => q.includes("MAT_"))).toBe(false);
  });

  it("names the BFE hop when it fails", async () => {
    fakeDatafordeler({ ...house, BBR_Grund: () => ({ nodes: [] }) });
    expect(await lookupLand({ husnummerId: HUSNUMMER, bfeNummer: null, matrikelnr: null, ejerlavskode: null })).toEqual({ ok: false, error: "bfe: no BBR_Grund on this husnummer" });
  });
});

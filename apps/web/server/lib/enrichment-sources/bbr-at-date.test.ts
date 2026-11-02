import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBygningAtQuery, lookupBbrAtDate, summariseBuildings } from "./bbr-at-date.js";
import { resetDatafordelerCache } from "./datafordeler.js";

const HUS = "0a3f509c-38ed-32b8-e044-0003ba298018";
const ASOF = "2018-05-04";
const VIRKNING = Date.parse(`${ASOF}T12:00:00.000Z`);

const house = { husnummer: HUS, status: "6", virkningFra: "1962-01-01T00:00:00Z", virkningTil: null, byg021BygningensAnvendelse: 120, byg026Opfoerelsesaar: 1962, byg027OmTilbygningsaar: 1990, byg038SamletBygningsareal: 168, byg039BygningensSamledeBoligAreal: 142, byg054AntalEtager: 2, byg056Varmeinstallation: 1 };
const garage = { husnummer: HUS, status: "6", virkningFra: "1970-01-01T00:00:00Z", virkningTil: null, byg021BygningensAnvendelse: 910, byg026Opfoerelsesaar: 1970, byg038SamletBygningsareal: 40 };

describe("summariseBuildings", () => {
  it("takes the building with the most residential area as the home, and counts the rest", () => {
    const r = summariseBuildings([garage, house], ASOF, HUS, VIRKNING);
    expect(r).toMatchObject({ ok: true, data: { buildingCount: 2, buildingUse: "120", yearBuilt: 1962, extensionYear: 1990, residentialAreaSqm: 142, totalAreaSqm: 168, floors: 2, heating: "fjernvarme", knowledge: "effective", asOf: ASOF } });
  });
  it("ignores buildings not yet effective on the day, such as a later extension registered as its own building", () => {
    const later = { ...house, virkningFra: "2020-01-01T00:00:00Z", byg039BygningensSamledeBoligAreal: 300 };
    const r = summariseBuildings([house, later], ASOF, HUS, VIRKNING);
    expect(r).toMatchObject({ ok: true, data: { residentialAreaSqm: 142, buildingCount: 1 } });
  });
  it("ignores buildings that had been torn down or are for another husnummer", () => {
    const gone = { ...house, virkningTil: "2010-01-01T00:00:00Z" };
    const other = { ...house, husnummer: "1b4f509c-38ed-32b8-e044-0003ba298018" };
    expect(summariseBuildings([gone, other], ASOF, HUS, VIRKNING)).toMatchObject({ ok: false, error: expect.stringContaining("no built BBR building") });
  });
  it("leaves the area null rather than inventing one when BBR gave none", () => {
    expect(summariseBuildings([garage], ASOF, HUS, VIRKNING)).toMatchObject({ ok: true, data: { residentialAreaSqm: null, totalAreaSqm: 40 } });
  });
});

describe("buildBygningAtQuery", () => {
  it("pins effective time to the sale date and registration time to the given instant", () => {
    const q = buildBygningAtQuery(HUS, "2026-11-02T10:00:00.000Z", "2018-05-04T12:00:00.000Z", ["byg026Opfoerelsesaar"]);
    expect(q).toContain('virkningstid: "2018-05-04T12:00:00.000Z"');
    expect(q).toContain('registreringstid: "2026-11-02T10:00:00.000Z"');
  });
});

describe("lookupBbrAtDate", () => {
  beforeEach(() => {
    resetDatafordelerCache();
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("falls back to a smaller field set when the register rejects a field", async () => {
    const docs: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((async (_url: unknown, init?: { body?: unknown }) => {
      const doc = JSON.parse(String(init?.body)).query as string;
      docs.push(doc);
      if (doc.includes("__type")) return { ok: true, status: 200, headers: new Headers(), json: async () => ({ errors: [{ message: "introspection disabled" }] }) };
      if (doc.includes("byg057Opvarmningsmiddel")) return { ok: true, status: 200, headers: new Headers(), json: async () => ({ errors: [{ message: "unknown field byg057Opvarmningsmiddel" }] }) };
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ data: { BBR_Bygning: { pageInfo: { hasNextPage: false }, nodes: [house] } } }) };
    }) as unknown as typeof fetch);

    const r = await lookupBbrAtDate(HUS, ASOF);
    expect(r).toMatchObject({ ok: true, data: { residentialAreaSqm: 142 } });
  });

  it("rejects a bad id or a future date without calling out", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await lookupBbrAtDate("nope", ASOF)).toMatchObject({ ok: false });
    expect(await lookupBbrAtDate(HUS, "2999-01-01")).toMatchObject({ ok: false });
    expect(await lookupBbrAtDate(HUS, "2018-02-31")).toMatchObject({ ok: false });
    expect(spy).not.toHaveBeenCalled();
  });
});

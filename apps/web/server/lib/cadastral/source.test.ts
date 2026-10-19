import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Property } from "../../../../../packages/shared/src/types/index.js";
import { stubFetch } from "../test-support/stub-fetch.js";
import { getCadastralReport, mapOwners } from "./source.js";
import { parseCadastralGeometry } from "./geometry.js";

const property = { id: "listing", address: "Slåenvej 18", postalCode: "9000", bfeNummer: "3299386", idLokalid: null, dataMode: "real" } as Property;
const geo = { wkt: "POLYGON ((552731.569 6322122.634, 552744.873 6322143.965, 552717.898 6322160.789, 552704.698 6322139.781, 552731.569 6322122.634))", crs: 25832 };
const connection = (items: unknown[], hasNextPage = false) => ({ nodes: items, pageInfo: { hasNextPage } });
const estate = { id_lokalId: "3299386", BFEnummer: 3299386, geometri: geo, hovedejendomOpdeltIEjerlejligh: false, erFaelleslod: false, udskiltVej: false };
const parcel = { id_lokalId: "1701306", matrikelnummer: "12ab", registreretAreal: 800, vejareal: 0, jordstykkeLiggerIEjerlav: { ejerlavskode: 610452, ejerlavsnavn: "Gl. Hasseris By, Hasseris" }, lodfladeRepraesentationJordstykke: connection([{ geometri: geo }]) };
const graph = (name: string, value: unknown) => ({ body: { data: { [name]: value } } });
const success = (parcels = [parcel], hasNextPage = false, ownerBody: unknown = { ejere: [] }) => [graph("MAT_SamletFastEjendom", connection([estate])), graph("MAT_Jordstykke", connection(parcels, hasNextPage)), { body: ownerBody }];

beforeEach(() => { vi.stubEnv("DATAFORDELER_API_KEY", "own-test-key"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("live-schema cadastral integration", () => {
  it("maps the verified example and queries current MAT/Flexible services with the deployment key", async () => {
    const fetch = stubFetch(success());
    const result = await getCadastralReport(property);
    expect(result).toMatchObject({ status: "available", bfeNumber: "3299386", scope: "land_property", mapUrl: "https://www.matriklen.dk/kort/sfe/3299386", totalAreaSqm: 800, parcelsComplete: true });
    expect(result.parcels[0]).toMatchObject({ number: "12ab", district: "Gl. Hasseris By, Hasseris", roadAreaSqm: 0 });
    expect(result.geometry?.polygons).toHaveLength(1);
    expect(fetch.urls[0]).toBe("https://graphql.datafordeler.dk/MAT/v2?apiKey=own-test-key");
    expect(fetch.urls[1]).toContain("/Flexible/v2?");
    expect(fetch.bodies[0]).toContain("registreringstid");
    expect(fetch.bodies[0]).toContain("virkningstid");
    expect(JSON.stringify(result)).not.toContain("own-test-key");
  });
  it("adds all direct parcels and never sums a truncated, duplicate, or missing-area set", async () => {
    stubFetch(success([parcel, { ...parcel, id_lokalId: "2", registreretAreal: 120 }]));
    expect((await getCadastralReport(property)).totalAreaSqm).toBe(920);
  });
  it.each(["truncated", "duplicate", "unknown_area"])("keeps total unknown for %s parcels", async mode => {
    const parcels = mode === "duplicate" ? [parcel, parcel] : mode === "unknown_area" ? [{ ...parcel, registreretAreal: null }] : [parcel];
    stubFetch(success(parcels as typeof parcel[], mode === "truncated"));
    expect((await getCadastralReport(property)).totalAreaSqm).toBeNull();
  });
  it("owner failure does not remove the map or areas", async () => {
    stubFetch([...success().slice(0, 2), { status: 504 }]);
    expect(await getCadastralReport(property)).toMatchObject({ status: "available", totalAreaSqm: 800, owners: { status: "unavailable", items: [] } });
  });
  it("parcel failure does not remove estate geometry or owners", async () => {
    stubFetch([success()[0]!, { status: 500 }, { body: { ejere: [{ type: "Virksomhed", navn: "Test A/S", cvr: "12345678" }] } }]);
    const result = await getCadastralReport(property);
    expect(result.totalAreaSqm).toBeNull();
    expect(result.geometry).not.toBeNull();
    expect(result.owners.items[0]?.name).toBe("Test A/S");
  });
  it.each(["hovedejendomOpdeltIEjerlejligh", "erFaelleslod"])("does not fetch or attribute owners for %s", async flag => {
    const fetch = stubFetch([graph("MAT_SamletFastEjendom", connection([{ ...estate, [flag]: true }])), success()[1]!]);
    const result = await getCadastralReport(property);
    expect(result.owners.status).toBe("unavailable");
    expect(fetch.urls).toHaveLength(2);
  });
  it("treats subdivision sentinel as a direction to unit owners, never a name", async () => {
    stubFetch(success([parcel], false, { ejere: [{ navn: "Opdelt i ejerlejligheder" }] }));
    expect((await getCadastralReport(property)).owners).toEqual({ status: "unavailable", items: [], reason: "condominium_parent" });
  });
  it("reports access-required owners separately", async () => {
    stubFetch([...success().slice(0, 2), { status: 401 }]);
    expect((await getCadastralReport(property)).owners.status).toBe("requires_access");
  });
  it("rejects a mismatched or multiple BFE response", async () => {
    const fetch = stubFetch([graph("MAT_SamletFastEjendom", connection([{ ...estate, BFEnummer: 123 }]))]);
    const result = await getCadastralReport(property);
    expect(result.status).toBe("not_found");
    expect(result.owners.items).toEqual([]);
    expect(fetch.urls).toHaveLength(1);
  });
  it("uses the exact DAR access-address join when no BFE is stored", async () => {
    const dar = connection([{ husnummerErPlaceretPaaJordstykke: connection([{ jordstykkeSamlesISamletFastEjendom: connection([{ BFEnummer: 3299386 }]) }]) }]);
    const fetch = stubFetch([graph("DAR_Husnummer", dar), ...success()]);
    expect((await getCadastralReport({ ...property, bfeNummer: null, idLokalid: "0a3f509c-b58c-32b8-e044-0003ba298018" })).totalAreaSqm).toBe(800);
    expect(fetch.bodies[0]).toContain("0a3f509c-b58c-32b8-e044-0003ba298018");
  });
  it("refuses ambiguous access-address property joins", async () => {
    const dar = connection([{ husnummerErPlaceretPaaJordstykke: connection([{ jordstykkeSamlesISamletFastEjendom: connection([{ BFEnummer: 3299386 }, { BFEnummer: 42 }]) }]) }]);
    const fetch = stubFetch([graph("DAR_Husnummer", dar)]);
    expect((await getCadastralReport({ ...property, bfeNummer: null, idLokalid: "0a3f509c-b58c-32b8-e044-0003ba298018" })).status).toBe("not_found");
    expect(fetch.urls).toHaveLength(1);
  });
  it("does not use a fuzzy or wrong-house address hit", async () => {
    const fetch = stubFetch([{ body: [{ id: "0a3f509c-b58c-32b8-e044-0003ba298018", vejstykke: { navn: "Slåenvej" }, husnr: "20", postnummer: { nr: "9000" } }] }]);
    expect((await getCadastralReport({ ...property, bfeNummer: null })).status).toBe("not_found");
    expect(fetch.urls).toHaveLength(1);
  });
  it("does not make network requests without deployment credentials or for demo listings", async () => {
    const fetch = stubFetch([]);
    await getCadastralReport({ ...property, dataMode: "demo" });
    vi.stubEnv("DATAFORDELER_API_KEY", "");
    expect((await getCadastralReport(property)).status).toBe("unavailable");
    expect(fetch.urls).toHaveLength(0);
  });
  it("handles malformed GraphQL without leaking raw source errors", async () => {
    stubFetch([{ body: { errors: [{ message: "secret diagnostics" }] } }]);
    const result = await getCadastralReport(property);
    expect(result.status).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});

describe("owner privacy and values", () => {
  it("whitelists fields and suppresses every protected name/company number", () => {
    const result = mapOwners({ ejere: [{ type: "BeskyttetPerson", navn: "Must never appear", cvr: "12345678", cpr: "secret", adresse: "secret", faktiskEjerandel: { tæller: 1, nævner: 2 }, tinglystEjerandel: { tæller: 1, nævner: 1 }, overtagelsesdato: "2020-01-01T00:00:00Z" }] });
    expect(result[0]).toMatchObject({ name: null, protected: true, companyNumber: null, actualShare: "1/2", registeredShare: "1/1", takeoverDate: "2020-01-01" });
    expect(JSON.stringify(result)).not.toMatch(/secret|Must never appear/);
  });
  it("does not fabricate shares or dates from missing or invalid fields", () => {
    expect(mapOwners({ ejere: [{ type: "Person", faktiskEjerandel: { tæller: 1, nævner: 0 }, tinglysningsdato: "no" }] })[0]).toMatchObject({ actualShare: null, registeredShare: null, registrationDate: null });
    expect(() => mapOwners({})).toThrow();
  });
});

describe("cadastral geometry", () => {
  it("preserves polygon holes and multipolygons", () => {
    const ring = "(552700 6322100,552750 6322100,552750 6322150,552700 6322100)";
    expect(parseCadastralGeometry({ crs: 25832, wkt: `MULTIPOLYGON ((${ring},${ring}),(${ring}))` })?.polygons.map(p => p.length)).toEqual([2, 1]);
  });
  it.each([{ ...geo, crs: 4326 }, { ...geo, wkt: "POLYGON EMPTY" }, { ...geo, wkt: "POLYGON ((1 2,3 4,5 6,1 2))" }, { ...geo, wkt: geo.wkt.replace("6322122.634))", "6322123.634))") }, { ...geo, wkt: geo.wkt.replace("552731.569", "bogus") }])("rejects malformed or unrecognised geometry", raw => {
    expect(parseCadastralGeometry(raw)).toBeNull();
  });
});

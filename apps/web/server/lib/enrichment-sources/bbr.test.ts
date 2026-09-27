import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBygningQuery, decodeHeating, fieldsInSchema, lookupBbr } from "./bbr.js";
import { resetDatafordelerCache } from "./datafordeler.js";
import { stubFetch } from "../test-support/stub-fetch.js";
import { enrichProperty } from "../crawl/enrich.js";
import type { RawListing } from "../crawl/types.js";
import type { AddressCadastral } from "./address-lookup.js";

// Exercise real BBR mapping through enrichment without unrelated network calls.
vi.mock("./ejendomsvurdering.js", () => ({ lookupEjendomsvurdering: vi.fn(async () => ({ ok: false, error: "outside this test" })) }));
vi.mock("./geus-jordart.js", () => ({ lookupSoilType: vi.fn(async () => ({ ok: false, error: "outside this test" })) }));
vi.mock("./miljoeportalen-v1v2.js", () => ({ lookupSoilContamination: vi.fn(async () => ({ ok: false, error: "outside this test" })) }));
vi.mock("./stoejkort.js", () => ({ lookupNoiseExposure: vi.fn(async () => ({ ok: false, error: "outside this test" })) }));

const HUSNUMMER = "0a3f507b-83d6-32b8-e044-0003ba298018";
const BUILDING_ID = "a49ca297-725b-4510-ae12-000000000001";
const NOW = "2026-09-27T10:00:00.000Z";
// Names/types and connection shape checked against the public entity schema:
// https://datafordeler.dk/GraphQLSchema/BBR.graphql (2026-09-27).
// References/codes are String; years/storeys Long. The filter has husnummer.
const house = {
  id_lokalId: BUILDING_ID, husnummer: HUSNUMMER, status: "6",
  registreringFra: "2025-01-01T09:00:00.000000+01:00", registreringTil: null,
  virkningFra: "1962-01-01T00:00:00Z", virkningTil: null,
  byg021BygningensAnvendelse: "120", byg026Opfoerelsesaar: 1962, byg027OmTilbygningsaar: 1998,
  byg032YdervaeggensMateriale: "1", byg033Tagdaekningsmateriale: "3", byg054AntalEtager: 1,
  byg056Varmeinstallation: "2", byg057Opvarmningsmiddel: "3",
};
const introspection = (fields = Object.keys(house)) => ({ data: { __type: { fields: fields.map(name => ({ name })) } } });
const graphQlBody = (nodes: unknown = [house], hasNextPage: unknown = false) => ({ data: { BBR_Bygning: { nodes, pageInfo: { hasNextPage } } } });
const NO_INTROSPECTION = { data: { __type: null } };
const setup = (body: unknown = graphQlBody()) => stubFetch([{ body: introspection() }, { body }]);
beforeEach(() => {
  resetDatafordelerCache();
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(NOW));
  vi.stubEnv("DATAFORDELER_API_KEY", "test-key"); vi.stubEnv("BBR_MOCK_MODE", "false"); vi.stubEnv("ENRICH_MOCK_MODE", "false");
  vi.stubEnv("DATAFORDELER_BBR_VERSION", ""); vi.stubEnv("DATAFORDELER_BBR_API_BASE", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("decodeHeating", () => {
  it("reads oil heating as the installation and fuel pair", () => {
    for (const installation of ["2", "6", "3"]) expect(decodeHeating(installation, "3")).toBe("oliefyr");
  });
  it("maps installation-only codes", () => {
    expect(decodeHeating("1", null)).toBe("fjernvarme"); expect(decodeHeating("5", null)).toBe("varmepumpe");
    expect(decodeHeating("7", null)).toBe("elvarme"); expect(decodeHeating("9", null)).toBe("ingen varmeinstallation");
  });
  it("does not call gas or unknown central heating an oil furnace", () => {
    expect(decodeHeating("2", "7")).toBe("naturgasfyr"); expect(decodeHeating("2", "4")).toBe("fast brændsel");
    expect(decodeHeating("2", null)).toBe("centralvarme");
  });
  it("returns null for missing or unknown installation codes", () => {
    expect(decodeHeating(null, "3")).toBeNull(); expect(decodeHeating("42", "3")).toBeNull();
  });
});

describe("direct BBR query", () => {
  it("uses the published building filter, mandatory identity and both temporal arguments", () => {
    const query = buildBygningQuery(HUSNUMMER, NOW, ["byg026Opfoerelsesaar"]);
    expect(query).toContain("BBR_Bygning("); expect(query).toContain(`husnummer: { eq: "${HUSNUMMER}" }`);
    expect(query).toContain('status: { eq: "6" }'); expect(query).toContain(`registreringstid: "${NOW}"`);
    expect(query).toContain(`virkningstid: "${NOW}"`); expect(query).toContain("first: 2"); expect(query).toContain("pageInfo { hasNextPage }");
    for (const field of ["id_lokalId", "husnummer", "status", "registreringFra", "registreringTil", "virkningFra", "virkningTil"]) expect(query).toContain(`\n      ${field}\n`);
    expect(query).not.toContain("DAR_Husnummer"); expect(query).not.toContain("husnummerGiverAdgangTilBygning");
  });
  it("adapts optional facts separately from required identity fields", () => {
    expect(fieldsInSchema(["byg026Opfoerelsesaar", "unknown"], new Set(["byg026Opfoerelsesaar"]))).toEqual(["byg026Opfoerelsesaar"]);
    expect(fieldsInSchema(["byg026Opfoerelsesaar"], null)).toEqual(["byg026Opfoerelsesaar"]);
  });
});

describe("lookupBbr using the published entity response shape", () => {
  it("returns facts for one exact current building, withholding unit area", async () => {
    const stub = setup(graphQlBody([{ ...house, byg038SamletBygningsareal: 600, byg039BygningensSamledeBoligAreal: 500 }]));
    expect(await lookupBbr(HUSNUMMER)).toEqual({ ok: true, data: {
      yearBuilt: 1962, renovationYear: 1998, areaSqm: null, buildingType: "120", floors: 1, roofMaterial: "3", wallMaterial: "1",
      heatingInstallation: "oliefyr", basementSqm: null, toiletCount: null, bathroomCount: null,
    } });
    expect(stub.urls.every(url => url.includes("/BBR/") && !url.includes("/DAR/"))).toBe(true);
    expect(stub.bodies[1]).not.toContain("byg039"); expect(stub.bodies[1]).not.toContain("byg038");
  });
  it("uses independent BBR endpoint settings", async () => {
    vi.stubEnv("DATAFORDELER_BBR_VERSION", "v2"); vi.stubEnv("DATAFORDELER_DAR_API_BASE", "https://dar.example/DAR/v1");
    const stub = setup(); expect((await lookupBbr(HUSNUMMER)).ok).toBe(true);
    expect(stub.urls.every(url => url.includes("/BBR/v2"))).toBe(true);
  });
  it("walks withdrawn BBR versions and caches the answering endpoint", async () => {
    const stub = stubFetch([{ status: 404 }, { body: NO_INTROSPECTION }, { body: graphQlBody() }]);
    expect((await lookupBbr(HUSNUMMER)).ok).toBe(true);
    expect(stub.urls[0]).toContain("/BBR/v3"); expect(stub.urls[1]).toContain("/BBR/v2"); expect(stub.urls[2]).toContain("/BBR/v2");
  });
  it("never relaxes temporal or identity constraints after a rejected query", async () => {
    const stub = stubFetch([{ body: NO_INTROSPECTION }, { body: { errors: [{ message: "The argument `registreringstid` does not exist." }] } }]);
    expect((await lookupBbr(HUSNUMMER)).ok).toBe(false); expect(stub.bodies).toHaveLength(3);
    for (const query of stub.bodies.slice(1)) {
      expect(query).toContain("registreringstid"); expect(query).toContain("virkningstid"); expect(query).toContain("husnummer"); expect(query).toContain("registreringTil");
    }
  });
  it("can retry fewer optional facts while preserving required checks", async () => {
    const coreHouse = Object.fromEntries(Object.entries(house).filter(([key]) => !key.startsWith("byg") || ["byg021BygningensAnvendelse", "byg026Opfoerelsesaar"].includes(key)));
    const stub = stubFetch([{ body: NO_INTROSPECTION }, { body: { errors: [{ message: "Unknown field optional" }] } }, { body: graphQlBody([coreHouse]) }]);
    expect(await lookupBbr(HUSNUMMER)).toMatchObject({ ok: true, data: { yearBuilt: 1962, areaSqm: null, heatingInstallation: null } });
    expect(stub.bodies[2]).not.toContain("byg057Opvarmningsmiddel"); expect(stub.bodies[2]).toContain("virkningTil");
  });
  it("fails when the schema lacks required identity fields", async () => {
    const stub = stubFetch([{ body: introspection(Object.keys(house).filter(field => field !== "husnummer")) }]);
    expect(await lookupBbr(HUSNUMMER)).toMatchObject({ ok: false, error: expect.stringContaining("required identity") });
    expect(stub.urls).toHaveLength(1);
  });
  it.each([null, [], [null], {}])("rejects absent or malformed node collections %j", async nodes => {
    setup(graphQlBody(nodes)); expect((await lookupBbr(HUSNUMMER)).ok).toBe(false);
  });
  it.each([true, undefined, null, "false"])("requires proven page completeness: %j", async hasNextPage => {
    setup({ data: { BBR_Bygning: { nodes: [house], pageInfo: { hasNextPage } } } }); expect((await lookupBbr(HUSNUMMER)).ok).toBe(false);
  });
  it("rejects multiple buildings and conflicting versions instead of picking the largest", async () => {
    for (const second of [{ ...house, id_lokalId: "a49ca297-725b-4510-ae12-000000000002", byg039BygningensSamledeBoligAreal: 900 }, { ...house, byg026Opfoerelsesaar: 2010 }, house]) {
      resetDatafordelerCache(); setup(graphQlBody([house, second]));
      expect(await lookupBbr(HUSNUMMER)).toMatchObject({ ok: false, error: expect.stringContaining("ambiguous") });
    }
  });
  it.each([{ husnummer: "a49ca297-725b-4510-ae12-000000000009" }, { husnummer: null }, { husnummer: "" }, { id_lokalId: null }, { id_lokalId: "building-1" }, { id_lokalId: "" }])("rejects missing or foreign identity %j", async change => {
    setup(graphQlBody([{ ...house, ...change }])); expect((await lookupBbr(HUSNUMMER)).ok).toBe(false);
  });
  it.each(["3", "9", "10", "11", null, undefined])("rejects a lifecycle that is not built: %j", async status => {
    setup(graphQlBody([{ ...house, status }])); expect((await lookupBbr(HUSNUMMER)).ok).toBe(false);
  });
  it.each([
    { registreringFra: "2026-09-28T00:00:00Z" }, { virkningFra: "2026-09-28T00:00:00Z" },
    { registreringTil: NOW }, { virkningTil: NOW }, { registreringTil: "2026-09-26T00:00:00Z" },
    { registreringFra: null }, { virkningFra: undefined }, { registreringTil: undefined }, { virkningTil: "" },
    { registreringFra: "2026-02-30T00:00:00Z" }, { virkningTil: "invalid" }, { virkningFra: "1962-01-01" },
  ])("rejects non-current or unproved temporal bounds %j", async change => {
    setup(graphQlBody([{ ...house, ...change }])); expect((await lookupBbr(HUSNUMMER)).ok).toBe(false);
  });
  it("accepts inclusive start bounds and a future end", async () => {
    setup(graphQlBody([{ ...house, registreringFra: NOW, virkningFra: NOW, virkningTil: "2027-01-01T00:00:00Z" }]));
    expect((await lookupBbr(HUSNUMMER)).ok).toBe(true);
  });
  it("does not send invalid entrance UUIDs or missing credentials to the source", async () => {
    const stub = setup();
    for (const value of [null, "", "address text", 'uuid" ) {']) expect((await lookupBbr(value)).ok).toBe(false);
    vi.stubEnv("DATAFORDELER_API_KEY", ""); expect(await lookupBbr(HUSNUMMER)).toMatchObject({ ok: false, error: expect.stringContaining("not configured") });
    expect(stub.urls).toHaveLength(0);
  });
  it("keeps unit-only values unknown as real building facts pass through enrichment", async () => {
    setup(graphQlBody([{ ...house, byg039BygningensSamledeBoligAreal: 1_200, byg038SamletBygningsareal: 1_800 }]));
    const result = await enrichProperty({ data_mode: "real", price: 3_850_000, sqm: 140, lat: 57, lon: 10, municipality: "Aalborg" } as RawListing,
      { idLokalid: HUSNUMMER } as AddressCadastral);
    expect(result.source_status.bbr).toMatchObject({ dataMode: "real", verificationStatus: "unverified" });
    expect(result.bbr_data).toMatchObject({ yearBuilt: 1962, areaSqm: null, energyLabel: null, toiletCount: null, bathroomCount: null });
    expect(result.risk_flags.oilTankRiskSource).toBe("bbr");
  });
});

describe("explicit demo mode", () => {
  it("keeps deterministic synthetic buildings behind the explicit flag", async () => {
    vi.stubEnv("BBR_MOCK_MODE", "true"); const first = await lookupBbr("test-uuid-1");
    expect(first).toEqual(await lookupBbr("test-uuid-1")); expect(first).toMatchObject({ ok: true, data: { yearBuilt: expect.any(Number) } });
  });
});

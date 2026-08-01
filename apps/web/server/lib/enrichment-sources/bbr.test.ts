import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBygningQuery, decodeHeating, lookupBbr, pickPrimaryBuilding } from "./bbr.js";
import { stubFetch } from "../test-support/stub-fetch.js";

const HUSNUMMER = "0a3f507b-83d6-32b8-e044-0003ba298018";

function graphQlBody(buildings: unknown) {
  return { data: { DAR_Husnummer: { nodes: [{ husnummerGiverAdgangTilBygning: buildings }] } } };
}

const house = {
  byg021BygningensAnvendelse: 120,
  byg026Opfoerelsesaar: 1962,
  byg027OmTilbygningsaar: 1998,
  byg038SamletBygningsareal: 168,
  byg039BygningensSamledeBoligAreal: 142,
  byg032YdervaeggensMateriale: 1,
  byg033Tagdaekningsmateriale: 3,
  byg054AntalEtager: 1,
  byg056Varmeinstallation: 2,
  byg057Opvarmningsmiddel: 3,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("decodeHeating", () => {
  it("reads oil heating as the installation+fuel pair BBR actually stores", () => {
    expect(decodeHeating("2", "3")).toBe("oliefyr");
    expect(decodeHeating("6", "3")).toBe("oliefyr");
    expect(decodeHeating("3", "3")).toBe("oliefyr");
  });

  it("maps the installation-only codes", () => {
    expect(decodeHeating("1", null)).toBe("fjernvarme");
    expect(decodeHeating("5", null)).toBe("varmepumpe");
    expect(decodeHeating("7", null)).toBe("elvarme");
    expect(decodeHeating("9", null)).toBe("ingen varmeinstallation");
  });

  it("does not call central heating on gas an oil furnace", () => {
    expect(decodeHeating("2", "7")).toBe("naturgasfyr");
    expect(decodeHeating("2", "4")).toBe("fast brændsel");
    expect(decodeHeating("2", null)).toBe("centralvarme");
  });

  it("returns null for a missing or unknown installation code", () => {
    expect(decodeHeating(null, "3")).toBeNull();
    expect(decodeHeating("42", "3")).toBeNull();
  });
});

describe("pickPrimaryBuilding", () => {
  it("picks the dwelling, not the first building the husnummer gives access to", () => {
    const garage = { byg021BygningensAnvendelse: 910, byg038SamletBygningsareal: 32 };
    const nodes = [{ husnummerGiverAdgangTilBygning: [garage, house] }];
    expect(pickPrimaryBuilding(nodes)?.byg026Opfoerelsesaar).toBe(1962);
  });

  it("accepts a single related building returned as an object", () => {
    expect(pickPrimaryBuilding([{ husnummerGiverAdgangTilBygning: house }])?.byg026Opfoerelsesaar).toBe(1962);
  });

  it("returns null when the husnummer has no linked building", () => {
    expect(pickPrimaryBuilding([{ husnummerGiverAdgangTilBygning: [] }])).toBeNull();
    expect(pickPrimaryBuilding(undefined)).toBeNull();
  });
});

describe("buildBygningQuery", () => {
  it("inlines the UUID and timestamp as escaped literals, avoiding typed variables", () => {
    const query = buildBygningQuery(HUSNUMMER, "2026-08-01T00:00:00.000Z", ["byg026Opfoerelsesaar"]);
    expect(query).toContain(`id_lokalId: { eq: "${HUSNUMMER}" }`);
    expect(query).toContain(`registreringstid: "2026-08-01T00:00:00.000Z"`);
    expect(query).not.toContain("$");
  });
});

describe("lookupBbr (live)", () => {
  it("maps a BBR building reached through the DAR husnummer", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    const stub = stubFetch([{ body: graphQlBody([house]) }]);

    const result = await lookupBbr(HUSNUMMER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      yearBuilt: 1962,
      renovationYear: 1998,
      areaSqm: 142,
      buildingType: "120",
      floors: 1,
      roofMaterial: "3",
      wallMaterial: "1",
      heatingInstallation: "oliefyr",
      basementSqm: null,
      toiletCount: null,
      bathroomCount: null,
    });
    expect(stub.urls[0]).toContain("apiKey=test-key");
    expect(stub.bodies[0]).toContain("byg057Opvarmningsmiddel");
  });

  it("falls back to the verified core field set when the extended one is rejected", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    const stub = stubFetch([
      { body: { errors: [{ message: "Unknown field 'byg057Opvarmningsmiddel'" }] } },
      { body: graphQlBody([{ byg026Opfoerelsesaar: 1962, byg038SamletBygningsareal: 168 }]) },
    ]);

    const result = await lookupBbr(HUSNUMMER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Year and area survive the bad guess; heating does not.
    expect(result.data.yearBuilt).toBe(1962);
    expect(result.data.areaSqm).toBe(168);
    expect(result.data.heatingInstallation).toBeNull();
    expect(stub.bodies[1]).not.toContain("byg057Opvarmningsmiddel");
  });

  it("reports both failures when the core field set fails too", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubFetch([{ body: { errors: [{ message: "extended boom" }] } }, { body: { errors: [{ message: "core boom" }] } }]);

    const result = await lookupBbr(HUSNUMMER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("core boom");
    expect(result.error).toContain("extended boom");
  });

  it("fails loudly without a credential rather than serving mock buildings", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "");
    const result = await lookupBbr(HUSNUMMER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("DATAFORDELER_API_KEY");
  });

  it("fails without an id_lokalid", async () => {
    const result = await lookupBbr(null);
    expect(result.ok).toBe(false);
  });
});

describe("lookupBbr (mock mode)", () => {
  it("returns deterministic building data only when the flag is enabled", async () => {
    vi.stubEnv("BBR_MOCK_MODE", "true");
    const first = await lookupBbr("test-uuid-1");
    const second = await lookupBbr("test-uuid-1");
    expect(first).toEqual(second);
    if (!first.ok) throw new Error("expected ok result");
    expect(first.data.yearBuilt).not.toBeNull();
    expect(first.data.areaSqm).not.toBeNull();
    expect(first.data.heatingInstallation).not.toBeNull();
  });
});

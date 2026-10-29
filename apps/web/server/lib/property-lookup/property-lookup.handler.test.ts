import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupProperty } from "./property-lookup.handler.js";
import { resetDatafordelerCache } from "../enrichment-sources/datafordeler.js";
import type { PropertyLookupInput } from "../../../../../packages/shared/src/types/property-lookup.js";

const input: PropertyLookupInput = {
  address: "Floravej 6, 9000 Aalborg",
  postalCode: "9000",
  askingPrice: 2_000_000,
  roomCount: 5,
  energyLabel: "B",
};

const floravej6 = { id: "0a3f509c-38ed-32b8-e044-0003ba298018" };

const POINTER_ID = "1b4f509c-38ed-32b8-e044-0003ba298018";
const connection = (nodes: unknown[]) => ({ nodes, pageInfo: { hasNextPage: false } });

/** DAR_Husnummer / DAR_Adressepunkt answers for Floravej 6, and the Flexible join to its parcel and BFE number. */
const DAR_HUSNUMMER = { id_lokalId: floravej6.id, adgangsadressebetegnelse: "Floravej 6, 9000 Aalborg", husnummertekst: "6", adgangspunkt: POINTER_ID };
const DAR_ADRESSEPUNKT = { id_lokalId: POINTER_ID, position: { wkt: "POINT (553173.08 6322838.76)", crs: "25832" } };
const FLEXIBLE_PARCEL = {
  husnummerErPlaceretPaaJordstykke: connection([{
    matrikelnummer: "42q",
    jordstykkeLiggerIEjerlav: { ejerlavskode: 610452, ejerlavsnavn: "Gl. Hasseris By, Hasseris" },
    jordstykkeSamlesISamletFastEjendom: connection([{ BFEnummer: 2340871 }]),
  }]),
};

/** Adressevælger `/husnumre/{id}` for the same address, as captured live on 2026-10-17. */
const husnummerBody = {
  status: "ok",
  husnummer: {
    id_lokalid: floravej6.id,
    adgangsadressebetegnelse: "Floravej 6, 9000 Aalborg",
    vejnavn: "Floravej",
    husnummertekst: "6",
    adgangspunkt: { koordinater: { x: 553173.08, y: 6322838.76 } },
    postnummer: { navn: "Aalborg", postnr: "9000" },
    navngivenvejkommunedel: { kommune: "0851" },
  },
};

const bbrBody = {
  data: {
    BBR_Bygning: {
      pageInfo: { hasNextPage: false },
      nodes: [
        {
          id_lokalId: "a49ca297-725b-4510-ae12-000000000001",
          husnummer: floravej6.id,
          status: "6",
          registreringFra: "2020-01-01T00:00:00Z",
          registreringTil: null,
          virkningFra: "1962-01-01T00:00:00Z",
          virkningTil: null,
          byg021BygningensAnvendelse: 120,
          byg026Opfoerelsesaar: 1962,
          byg038SamletBygningsareal: 168,
          byg039BygningensSamledeBoligAreal: 142,
          byg056Varmeinstallation: 1,
        },
      ],
    },
  },
};

const valuationBody = {
  data: { VUR_Ejendomsvurdering: { nodes: [{ ejendomsvaerdi: 3_150_000, grundvaerdi: 780_000, vurderingsaar: 2025 }] } },
};

/** Miljøstyrelsen's "Veje i by" layer answering one 60–64 dB band; every other noise layer answers none. */
const noiseBody = { features: [{ properties: { db_low: 60, db_high: 64 } }] };
const NOISE_LAYER_WITH_BAND = "stoej:b1_dk_aggroad_lden1_5_test";

/** What the Datafordeler registers answer when asked which fields a type has. */
function introspectionBody(fields: string[]) {
  return { data: { __type: { fields: fields.map((name) => ({ name })) } } };
}

const BYGNING_FIELDS = [
  "id_lokalId", "husnummer", "status", "registreringFra", "registreringTil", "virkningFra", "virkningTil",
  "byg007Bygningsnummer",
  "byg021BygningensAnvendelse",
  "byg026Opfoerelsesaar",
  "byg027OmTilbygningsaar",
  "byg032YdervaeggensMateriale",
  "byg033Tagdaekningsmateriale",
  "byg038SamletBygningsareal",
  "byg039BygningensSamledeBoligAreal",
  "byg054AntalEtager",
  "byg056Varmeinstallation",
  "byg057Opvarmningsmiddel",
];

const VALUATION_FIELDS = ["bfeNummer", "ejendomsvaerdi", "grundvaerdi", "vurderingsaar"];

/**
 * The address lookup resolves first and on its own; BBR, VUR and noise then
 * run concurrently, so their responses are matched by URL rather than by
 * position in the queue. Each Datafordeler register is asked for its schema
 * before its first query, which is matched on the request body.
 */
const RELATION_ID = "0a3f50f5-1111-4222-8333-444455556666";

/** What the BBR and VUR entity queries of the by-id valuation chain answer for a house, keyed by entity. */
const HOUSE_CHAIN: Record<string, unknown[]> = {
  BBR_Bygning: [{ byg021BygningensAnvendelse: 120 }, { byg021BygningensAnvendelse: 910 }],
  BBR_Grund: [{ id_lokalId: "g1", bestemtFastEjendom: RELATION_ID }],
  BBR_Ejendomsrelation: [{ id_lokalId: RELATION_ID, bfeNummer: 5_000_001 }],
  VUR_BFEKrydsreference: [{ fkEjendomsvurderingID: 2_024_000 }],
  VUR_Ejendomsvurdering: [
    { id: 2_024_000, aar: 2024, ejendomvaerdiBeloeb: 3_150_000, grundvaerdiBeloeb: 780_000, ajourfoeringDato: "2025-03-01T00:00:00Z", VURMark: 3, aendringDato: "2024-12-31" },
  ],
};

/** What MAT answers for the estate behind BFE 2340871: one ordinary parcel, nothing registered on it. */
const MAT_ESTATE = { id_lokalId: "e1", BFEnummer: 2_340_871, landbrugsnotering: null, erFaelleslod: false, hovedejendomOpdeltIEjerlejligh: false };
const MAT_PARCEL = { id_lokalId: "p1", registreretAreal: 812, fredskov_areal: null, strandbeskyttelse_areal: null, klitfredning_areal: null, majoratsskov_nummer: null, faelleslod: false };

function stubPipeline(overrides: { bbr?: unknown; valuation?: unknown; noise?: unknown; soil?: unknown; chain?: Record<string, unknown[]>; matParcels?: unknown[] } = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((async (url: unknown, init?: { body?: unknown }) => {
    const href = String(url);
    const introspecting = typeof init?.body === "string" && init.body.includes("__type");
    // The by-id valuation chain sends `query Q { Entity(...) }` documents; BBR's building facts use a named query.
    const chainEntity = typeof init?.body === "string" ? init.body.match(/query Q \{ (\w+)/)?.[1] : undefined;
    if (chainEntity) {
      const nodes = (overrides.chain ?? HOUSE_CHAIN)[chainEntity] ?? [];
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ data: { [chainEntity]: { pageInfo: { hasNextPage: false }, nodes } } }) };
    }
    // MAT's documents are named queries, so they never match the chain pattern above.
    if (href.includes("/MAT/") && typeof init?.body === "string") {
      const entity = JSON.parse(init.body).query.match(/\{\s+(\w+)\(/)?.[1] as string;
      const nodes = entity === "MAT_SamletFastEjendom" ? [MAT_ESTATE] : (overrides.matParcels ?? [MAT_PARCEL]);
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ data: { [entity]: { pageInfo: { hasNextPage: false }, nodes } } }) };
    }
    if (href.includes("wfs2-miljoegis.mim.dk")) {
      const layer = new URL(href).searchParams.get("typeNames");
      const noise = layer === NOISE_LAYER_WITH_BAND ? (overrides.noise ?? noiseBody) : { features: [] };
      return { ok: true, status: 200, headers: new Headers(), json: async () => noise };
    }
    if (href.includes("jord.miljoeportal.dk")) {
      return { ok: true, status: 200, headers: new Headers(), json: async () => overrides.soil ?? { features: [] } };
    }
    const documentBody = typeof init?.body === "string" ? (JSON.parse(init.body).query as string) : "";
    const body = href.includes("husnumre/soeg")
      ? { status: "ok", fund: [{ type: "husnummer", id: floravej6.id, titel: "Floravej 6, 9000 Aalborg", vejnavn: "Floravej", husnummer: "6" }] }
      : href.includes("adressevaelger.dk")
      ? husnummerBody
      : href.includes("/Flexible/")
      ? { data: { DAR_Husnummer: connection([FLEXIBLE_PARCEL]) } }
      : href.includes("/DAR/")
      ? documentBody.includes("AdressepunktLookup")
        ? { data: { DAR_Adressepunkt: connection([DAR_ADRESSEPUNKT]) } }
        : { data: { DAR_Husnummer: connection([DAR_HUSNUMMER]) } }
      : href.includes("/BBR/")
          ? introspecting
            ? introspectionBody(BYGNING_FIELDS)
            : (overrides.bbr ?? bbrBody)
          : href.includes("/VUR/")
            ? introspecting
              ? introspectionBody(VALUATION_FIELDS)
              : (overrides.valuation ?? valuationBody)
            : { error: `unexpected request ${href}` };
    return { ok: true, status: 200, headers: new Headers(), json: async () => body };
  }) as unknown as typeof fetch);
}

beforeEach(() => {
  resetDatafordelerCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("lookupProperty (live)", () => {
  it("returns register data, not mock data, and says so in sources", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubPipeline();

    const result = await lookupProperty(input);

    expect(result.dataMode).toBe("live");
    expect(result.sources.every((s) => s.mode === "live")).toBe(true);
    expect(result.resolved.matrikelnr).toBe("42q");
    expect(result.resolved.ejerlav).toBe("Gl. Hasseris By, Hasseris");
    expect(result.resolved.bfeNummer).toBe("2340871");
    expect(result.bbrData?.yearBuilt).toBe(1962);
    expect(result.bbrData?.areaSqm).toBeNull(); // Entrance/building identity does not identify the housing unit.
    expect(result.bbrData?.heatingInstallation).toBe("fjernvarme");
    expect(result.publicValuation?.assessedPropertyValueDkk).toBe(3_150_000);
    expect(result.scoringInputs.noiseZoneEstimate).toBe(60);
    expect(result.source).toBe("ai");
  });

  it("returns no sale history, because no licensed sales source is connected", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubPipeline();

    const result = await lookupProperty(input);

    expect(result.priceHistory).toEqual([]);
    expect(result.priceHistoryMatch).toBeNull();
    expect(result.sources.some((s) => s.key === "sales")).toBe(false);
  });

  it("geocodes from the address so downstream lookups get real coordinates", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    const fetchSpy = stubPipeline();

    const result = await lookupProperty(input);

    expect(result.resolved.lat).toBeCloseTo(57.0459);
    expect(result.resolved.lon).toBeCloseTo(9.8764);
    const noiseCall = fetchSpy.mock.calls.map((c) => String(c[0])).find((u) => u.includes("wfs"));
    expect(noiseCall).toBeDefined();
    expect(noiseCall).not.toContain("bbox=0,0");
  });

  it("names the reason for each unavailable source instead of silently nulling it", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "");
    stubPipeline();

    const result = await lookupProperty(input);

    expect(result.dataMode).toBe("unavailable");
    expect(result.bbrData).toBeNull();
    expect(result.publicValuation).toBeNull();
    const bbr = result.sources.find((s) => s.key === "bbr");
    expect(bbr?.mode).toBe("unavailable");
    expect(bbr?.error).toContain("DATAFORDELER_API_KEY");
    // The credential-free source still resolves identity, but without a Datafordeler key there is no parcel.
    expect(result.sources.find((s) => s.key === "address")?.mode).toBe("live");
    expect(result.resolved.idLokalid).toBe(floravej6.id);
    expect(result.resolved.matrikelnr).toBeNull();
  });

  it("skips the noise lookup rather than querying it at 0,0 when the address is unresolvable", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({}),
    })) as unknown as typeof fetch);

    const result = await lookupProperty({ ...input, address: "ikke en adresse" });

    expect(result.resolved.idLokalid).toBeNull();
    expect(fetchSpy.mock.calls.map((c) => String(c[0])).some((u) => u.includes("wfs"))).toBe(false);
    const noise = result.sources.find((s) => s.key === "noise");
    expect(noise?.mode).toBe("unavailable");
    expect(noise?.error).toContain("coordinates");
  });

  it("still screens against all six criteria and tags every result source: ai", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubPipeline();

    const result = await lookupProperty(input);

    expect(result.screening).toHaveLength(6);
    for (const criterion of result.screening) expect(criterion.source).toBe("ai");
    expect(result.renovationCategory.source).toBe("ai");
    expect(result.scoringInputs.source).toBe("ai");
  });
});

describe("lookupProperty (mock mode)", () => {
  it("keeps mock data out of property facts and prevents mock identifiers feeding live sources", async () => {
    vi.stubEnv("ADDRESS_LOOKUP_MOCK_MODE", "true");
    vi.stubEnv("BBR_MOCK_MODE", "true");
    vi.stubEnv("EJENDOMSVURDERING_MOCK_MODE", "true");
    vi.stubEnv("STOEJKORT_MOCK_MODE", "true");

    const first = await lookupProperty(input);
    const second = await lookupProperty(input);

    expect(first).toEqual(second);
    expect(first.sources.find((s) => s.key === "address")?.mode).toBe("mock");
    expect(first.resolved.idLokalid).toBeNull();
    expect(first.resolved.lat).toBeNull();
    expect(first.bbrData).toBeNull();
    expect(first.publicValuation).toBeNull();
    expect(first.priceHistory).toEqual([]);
    expect(first.nearbySales).toEqual([]);
    expect(first.scoringInputs.areaMarginSqm).toBeNull();
  });
});

describe("lookupProperty by husnummer id (an address that is not a listing)", () => {
  const byId: PropertyLookupInput = { address: "", husnummerId: floravej6.id };

  it("resolves from the id alone, never searching by free text", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    const fetchSpy = stubPipeline();

    const result = await lookupProperty(byId);

    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("husnumre/soeg") || u.includes("/DAR/"))).toBe(false);
    expect(urls.some((u) => u.includes(`adressevaelger.dk/husnumre/${floravej6.id}`))).toBe(true);
    expect(result.address).toBe("Floravej 6, 9000 Aalborg");
    expect(result.resolved).toMatchObject({
      idLokalid: floravej6.id,
      formattedAddress: "Floravej 6, 9000 Aalborg",
      postalCode: "9000",
    });
    expect(result.resolved.lat).toBeCloseTo(57.0459, 3);
    expect(result.resolved.lon).toBeCloseTo(9.8764, 3);
    expect(result.sources.find((s) => s.key === "address")).toMatchObject({
      mode: "live",
      register: expect.stringContaining("Adressevælger"),
    });
  });

  it("keys BBR and noise off the resolved id and coordinates", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubPipeline();

    const result = await lookupProperty(byId);

    expect(result.bbrData?.yearBuilt).toBe(1962);
    expect(result.scoringInputs.noiseZoneEstimate).toBe(60);
    expect(result.sources.find((s) => s.key === "bbr")?.mode).toBe("live");
    expect(result.sources.find((s) => s.key === "noise")?.mode).toBe("live");
  });

  it("builds the due-diligence flags from what the lookup found: BBR heating, the noise reading, the municipality's links", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubPipeline();

    const result = await lookupProperty(byId);

    expect(result.riskFlags).toMatchObject({
      noiseExposureLden: null,
      noiseBand: { lowerDb: 60, upperDb: 64, source: "roads_in_towns" },
      noiseChecked: true,
      oilTankRisk: false,
      oilTankRiskSource: "bbr",
      buildingCaseArchiveUrl: "https://weblager.dk/public/municipality/851/45/search/all",
      sewerSeparationLookupUrl: "https://www.aalborg.dk/",
      encumbranceLookupUrl: "https://www.tinglysning.dk/",
      soilContamination: { classification: "none", jordart: null },
    });
  });

  it("leaves a due-diligence item unknown when its register did not answer, never filling it in", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "");
    stubPipeline();

    const result = await lookupProperty(byId);

    expect(result.riskFlags?.oilTankRiskSource).toBe("heuristic"); // no BBR: unknown, not a guess
    expect(result.riskFlags?.buildingCaseArchiveUrl).not.toBeNull(); // the address register still answered
  });

  it("builds the same flags for a listing's free-text lookup, so its page shows live answers", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubPipeline({ soil: { features: [{ properties: { Lokalitetsnavn: "Tidligere autoværksted", Jordforureningsattester: "https://jord.miljoeportal.dk/report/?elav=1&matrnr=2a" } }] } });
    const flags = (await lookupProperty(input)).riskFlags;
    expect(flags).toMatchObject({
      oilTankRiskSource: "bbr",
      noiseBand: { lowerDb: 60 },
      soilContamination: { classification: "v2" },
      soilContaminationAttestUrl: "https://jord.miljoeportal.dk/report/?elav=1&matrnr=2a",
      soilContaminationSiteName: "Tidligere autoværksted",
    });
  });

  it("finds a house's BFE and valuation from the husnummer, since the address register returns no parcel", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubPipeline();

    const result = await lookupProperty(byId);

    expect(result.propertyClass).toBe("house");
    expect(result.resolved.matrikelnr).toBeNull();
    expect(result.resolved.bfeNummer).toBe("5000001");
    expect(result.publicValuation).toEqual({ assessedPropertyValueDkk: 3_150_000, assessedLandValueDkk: 780_000, valuationYear: 2024 });
    expect(result.valuationHistory).toEqual([{ year: 2024, propertyValueDkk: 3_150_000, landValueDkk: 780_000, registeredAt: "2025-03-01T00:00:00.000Z" }]);
    expect(result.sources.find((s) => s.key === "publicValuation")).toMatchObject({ mode: "live", error: null });
  });

  it("gives an apartment building no parcel valuation, because VUR keys an apartment by its own BFE", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    const fetchSpy = stubPipeline({ chain: { ...HOUSE_CHAIN, BBR_Bygning: [{ byg021BygningensAnvendelse: 140 }] } });

    const result = await lookupProperty(byId);

    expect(result.propertyClass).toBe("other");
    expect(result.publicValuation).toBeNull();
    expect(result.valuationHistory).toEqual([]);
    const valuation = result.sources.find((s) => s.key === "publicValuation");
    expect(valuation?.mode).toBe("unavailable");
    expect(valuation?.error).toContain("not a house");
    const queried = fetchSpy.mock.calls.map((c) => String((c[1] as { body?: string } | undefined)?.body ?? ""));
    expect(queried.some((q) => q.includes("VUR_BFEKrydsreference"))).toBe(false);
  });

  it("names the failing hop when the chain breaks, and still resolves everything else", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubPipeline({ chain: { ...HOUSE_CHAIN, VUR_BFEKrydsreference: [] } });

    const result = await lookupProperty(byId);

    expect(result.propertyClass).toBe("house");
    expect(result.publicValuation).toBeNull();
    expect(result.sources.find((s) => s.key === "publicValuation")?.error).toBe("valuation: no valuation registered for BFE 5000001");
    expect(result.resolved.bfeNummer).toBe("5000001");
    expect(result.bbrData?.yearBuilt).toBe(1962);
  });

  it("keys free-text lookups by the address register's BFE, without walking BBR to find one", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    const fetchSpy = stubPipeline();

    const result = await lookupProperty(input);

    expect(result.valuationHistory).toEqual([]);
    expect(result.propertyClass).toBeNull();
    expect(result.publicValuation?.assessedPropertyValueDkk).toBe(3_150_000);
    const queried = fetchSpy.mock.calls.map((c) => String((c[1] as { body?: string } | undefined)?.body ?? ""));
    expect(queried.some((q) => q.includes("VUR_BFEKrydsreference") && q.includes("eq: 2340871"))).toBe(true);
    expect(queried.some((q) => q.includes("BBR_Ejendomsrelation"))).toBe(false);
  });

  it("evaluates no price-based criterion without an asking price", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubPipeline();

    const result = await lookupProperty(byId);

    expect(result.screening).toHaveLength(6);
    const unavailable = result.screening.filter((c) => /No asking price/.test(c.reason)).map((c) => c.key);
    expect(unavailable).toEqual(["priceCeiling", "monthlyCost", "encumbranceRatio"]);
    expect(result.scoringInputs.priceHeadroomDkk).toBeNull();
  });

  it("reports an unknown id as an unavailable address with the upstream reason", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch").mockImplementation((async () => ({
      ok: false,
      status: 404,
      headers: new Headers(),
      json: async () => ({}),
    })) as unknown as typeof fetch);

    const result = await lookupProperty(byId);

    expect(result.resolved.idLokalid).toBeNull();
    expect(result.resolved.lat).toBeNull();
    const address = result.sources.find((s) => s.key === "address");
    expect(address?.mode).toBe("unavailable");
    expect(address?.error).toContain("404");
    expect(result.dataMode).toBe("unavailable");
  });
});

describe("lookupProperty: land, tanks and valuation in the due-diligence flags", () => {
  const byId: PropertyLookupInput = { address: "", husnummerId: floravej6.id };

  it("reports MAT and the BBR tank register as sources and fills the flags from them", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubPipeline({
      matParcels: [{ ...MAT_PARCEL, fredskov_areal: 300 }],
      chain: {
        ...HOUSE_CHAIN,
        BBR_TekniskAnlaeg: [{ id_lokalId: "t1", status: "6", tek020Klassifikation: "1110", tek032Stoerrelse: 1500, tek067Fabrikationsaar: 1978, tek110Driftstatus: "1" }],
      },
    });

    const result = await lookupProperty(byId);

    expect(result.sources.find((s) => s.key === "land")).toMatchObject({ mode: "live", error: null });
    expect(result.sources.find((s) => s.key === "oilTanks")).toMatchObject({ mode: "live", error: null });
    expect(result.riskFlags?.landRegistration).toMatchObject({ totalAreaSqm: 812, forestReserve: { areaSqm: 300 } });
    expect(result.riskFlags?.oilTanks?.tanks).toHaveLength(1);
    // A standing tank is a finding even though the building's heating is district heating.
    expect(result.riskFlags).toMatchObject({ oilTankRisk: true, oilTankRiskSource: "bbr" });
    expect(result.riskFlags?.valuation).toMatchObject({ year: 2024, propertyValueDkk: 3_150_000, landValueDkk: 780_000 });
  });

  it("leaves the flags answered by nothing when the registers cannot answer, never 'no tank'", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubPipeline({ chain: { ...HOUSE_CHAIN, BBR_Grund: [] } });

    const result = await lookupProperty(byId);

    expect(result.sources.find((s) => s.key === "land")?.mode).toBe("unavailable");
    expect(result.riskFlags?.landRegistration).toBeNull();
    expect(result.riskFlags?.valuation).toBeNull();
  });
});

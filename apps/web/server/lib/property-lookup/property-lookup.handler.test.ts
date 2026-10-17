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

const dawaRecord = {
  id: "0a3f509c-38ed-32b8-e044-0003ba298018",
  husnr: "6",
  vejstykke: { navn: "Floravej" },
  postnummer: { nr: "9000", navn: "Aalborg" },
  adgangspunkt: { koordinater: [9.87640126, 57.04591973] },
  ejerlav: { kode: 610452, navn: "Gl. Hasseris By, Hasseris" },
  matrikelnr: "42q",
  jordstykke: { href: "https://api.dataforsyningen.dk/jordstykker/610452/42q", matrikelnr: "42q" },
  zone: "Udfaset",
};

const parcelRecord = { bfenummer: 2340871 };

/** Adressevælger `/husnumre/{id}` for the same address, as captured live on 2026-10-17. */
const husnummerBody = {
  status: "ok",
  husnummer: {
    id_lokalid: dawaRecord.id,
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
          husnummer: dawaRecord.id,
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

const noiseBody = { features: [{ properties: { lden: 57 } }] };

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

/** Boligsiden's record of Floravej 6, as its address search answers it. */
const BOLIGSIDEN_FLORAVEJ_6 = {
  addressID: "boligsiden-id-we-do-not-know",
  addressType: "villa",
  coordinates: { lat: 57.04592, lon: 9.8764 },
  road: { name: "Floravej" },
  houseNumber: "6",
  zipCode: 9000,
  cityName: "Aalborg",
  registrations: [
    { amount: 3_000_000, date: "2019-02-01", livingArea: 150, perAreaPrice: 20000, type: "normal" },
    { amount: 1_495_000, date: "2004-08-23", area: 201, type: "family" },
  ],
};

function stubPipeline(overrides: { bbr?: unknown; valuation?: unknown; noise?: unknown; chain?: Record<string, unknown[]>; boligsiden?: unknown[] } = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((async (url: unknown, init?: { body?: unknown }) => {
    const href = String(url);
    const introspecting = typeof init?.body === "string" && init.body.includes("__type");
    // The by-id valuation chain sends `query Q { Entity(...) }` documents; BBR's building facts use a named query.
    const chainEntity = typeof init?.body === "string" ? init.body.match(/query Q \{ (\w+)/)?.[1] : undefined;
    if (chainEntity) {
      const nodes = (overrides.chain ?? HOUSE_CHAIN)[chainEntity] ?? [];
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ data: { [chainEntity]: { pageInfo: { hasNextPage: false }, nodes } } }) };
    }
    if (href.includes("api.boligsiden.dk/search/addresses")) {
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ addresses: overrides.boligsiden ?? [] }) };
    }
    const body = href.includes("adressevaelger.dk")
      ? husnummerBody
      : href.includes("adgangsadresser")
      ? [dawaRecord]
      : href.includes("/jordstykker/")
        ? parcelRecord
        : href.includes("/BBR/")
          ? introspecting
            ? introspectionBody(BYGNING_FIELDS)
            : (overrides.bbr ?? bbrBody)
          : href.includes("/VUR/")
            ? introspecting
              ? introspectionBody(VALUATION_FIELDS)
              : (overrides.valuation ?? valuationBody)
            : (overrides.noise ?? noiseBody);
    return { ok: true, status: 200, headers: new Headers(), json: async () => body };
  }) as unknown as typeof fetch);
}

beforeEach(() => {
  resetDatafordelerCache();
  // The noise layer is deployment configuration — without it the source is
  // reported unconfigured rather than queried.
  vi.stubEnv("STOEJKORT_TYPENAME", "stoej:lden_vej_bane");
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
    expect(result.scoringInputs.noiseZoneEstimate).toBe(57);
    expect(result.source).toBe("ai");
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
    // The credential-free source still resolves.
    expect(result.sources.find((s) => s.key === "address")?.mode).toBe("live");
    expect(result.resolved.matrikelnr).toBe("42q");
  });

  it("skips the noise lookup rather than querying it at 0,0 when the address is unresolvable", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((async (url: unknown) => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => (String(url).includes("adgangsadresser") ? [] : {}),
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
    vi.stubEnv("BOLIGSIDEN_SALES_MOCK_MODE", "true");

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
  const byId: PropertyLookupInput = { address: "", husnummerId: dawaRecord.id };

  it("resolves from the id alone, never touching the closed free-text register", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    const fetchSpy = stubPipeline();

    const result = await lookupProperty(byId);

    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("adgangsadresser"))).toBe(false);
    expect(urls.some((u) => u.includes(`adressevaelger.dk/husnumre/${dawaRecord.id}`))).toBe(true);
    expect(result.address).toBe("Floravej 6, 9000 Aalborg");
    expect(result.resolved).toMatchObject({
      idLokalid: dawaRecord.id,
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

  it("keys BBR, noise and sales off the resolved id and coordinates", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubPipeline();

    const result = await lookupProperty(byId);

    expect(result.bbrData?.yearBuilt).toBe(1962);
    expect(result.scoringInputs.noiseZoneEstimate).toBe(57);
    expect(result.sources.find((s) => s.key === "bbr")?.mode).toBe("live");
    expect(result.sources.find((s) => s.key === "noise")?.mode).toBe("live");
  });

  it("attributes Boligsiden's sale history to the address by its street, number and postcode", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubPipeline({ boligsiden: [BOLIGSIDEN_FLORAVEJ_6] });

    const result = await lookupProperty(byId);

    expect(result.priceHistoryMatch).toBe("matched");
    expect(result.priceHistory.map((entry) => [entry.soldDate, entry.price, entry.saleType])).toEqual([
      ["2019-02-01", 3_000_000, "normal"],
      ["2004-08-23", 1_495_000, "family"],
    ]);
  });

  it("gives no history, and says why, when Boligsiden has no address with this street, number and postcode", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubPipeline({ boligsiden: [{ ...BOLIGSIDEN_FLORAVEJ_6, houseNumber: "8" }] });

    const result = await lookupProperty(byId);

    expect(result.priceHistoryMatch).toBe("not_found");
    expect(result.priceHistory).toEqual([]);
  });

  it("does not attribute a history to a free-text listing lookup, which has no verified identity", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    stubPipeline({ boligsiden: [BOLIGSIDEN_FLORAVEJ_6] });

    const result = await lookupProperty(input);

    expect(result.priceHistoryMatch).toBeNull();
    expect(result.priceHistory).toEqual([]);
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

  it("leaves free-text lookups on their original valuation path", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    const fetchSpy = stubPipeline();

    const result = await lookupProperty(input);

    expect(result.valuationHistory).toEqual([]);
    expect(result.propertyClass).toBeNull();
    expect(result.publicValuation?.assessedPropertyValueDkk).toBe(3_150_000);
    const queried = fetchSpy.mock.calls.map((c) => String((c[1] as { body?: string } | undefined)?.body ?? ""));
    expect(queried.some((q) => q.includes("VUR_BFEKrydsreference") || q.includes("BBR_Grund"))).toBe(false);
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

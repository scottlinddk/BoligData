import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupProperty } from "./property-lookup.handler.js";
import { stubFetch } from "../test-support/stub-fetch.js";
import type { PropertyLookupInput } from "../../../../../packages/shared/src/types/property-lookup.js";

const input: PropertyLookupInput = {
  address: "Floravej 6, 9000 Aalborg",
  postalCode: "9000",
  askingPrice: 2_000_000,
  roomCount: 5,
  energyLabel: "B",
};

const dawaRecord = {
  id: "0a3f507b-83d6-32b8-e044-0003ba298018",
  husnr: "6",
  vejstykke: { navn: "Floravej" },
  postnummer: { nr: "9000", navn: "Aalborg" },
  adgangspunkt: { koordinater: [9.9187, 57.048] },
  jordstykke: { matrikelnr: "481i", ejerlav: { kode: 620551, navn: "Sofiendal, Aalborg Jorder" }, bfenummer: 2340871 },
  zone: "Byzone",
};

const bbrBody = {
  data: {
    DAR_Husnummer: {
      nodes: [
        {
          husnummerGiverAdgangTilBygning: [
            {
              byg021BygningensAnvendelse: 120,
              byg026Opfoerelsesaar: 1962,
              byg038SamletBygningsareal: 168,
              byg039BygningensSamledeBoligAreal: 142,
              byg056Varmeinstallation: 1,
            },
          ],
        },
      ],
    },
  },
};

const valuationBody = {
  data: { VUR_Ejendomsvurdering: { nodes: [{ ejendomsvaerdi: 3_150_000, grundvaerdi: 780_000, vurderingsaar: 2025 }] } },
};

const noiseBody = { features: [{ properties: { lden: 57 } }] };

/**
 * The address lookup resolves first and on its own; BBR, VUR and noise then
 * run concurrently, so their responses are matched by URL rather than by
 * position in the queue.
 */
function stubPipeline(overrides: { bbr?: unknown; valuation?: unknown; noise?: unknown } = {}) {
  const responses = [
    { body: [dawaRecord] },
    { body: overrides.bbr ?? bbrBody },
    { body: overrides.valuation ?? valuationBody },
    { body: overrides.noise ?? noiseBody },
  ];
  const stub = stubFetch([]);
  stub.restore();

  return vi.spyOn(globalThis, "fetch").mockImplementation((async (url: unknown) => {
    const href = String(url);
    const body = href.includes("adgangsadresser")
      ? responses[0]!.body
      : href.includes("/DAR/")
        ? responses[1]!.body
        : href.includes("/VUR/")
          ? responses[2]!.body
          : responses[3]!.body;
    return { ok: true, status: 200, headers: new Headers(), json: async () => body };
  }) as unknown as typeof fetch);
}

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
    expect(result.resolved.matrikelnr).toBe("481i");
    expect(result.resolved.bfeNummer).toBe("2340871");
    expect(result.resolved.zone).toBe("byzone");
    expect(result.bbrData?.yearBuilt).toBe(1962);
    expect(result.bbrData?.areaSqm).toBe(142);
    expect(result.bbrData?.heatingInstallation).toBe("fjernvarme");
    expect(result.publicValuation?.assessedPropertyValueDkk).toBe(3_150_000);
    expect(result.scoringInputs.noiseZoneEstimate).toBe(57);
    expect(result.source).toBe("ai");
  });

  it("geocodes from the address so downstream lookups get real coordinates", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    const fetchSpy = stubPipeline();

    const result = await lookupProperty(input);

    expect(result.resolved.lat).toBeCloseTo(57.048);
    expect(result.resolved.lon).toBeCloseTo(9.9187);
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
    expect(result.resolved.matrikelnr).toBe("481i");
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
  it("is deterministic and flags every source as mock", async () => {
    vi.stubEnv("ADDRESS_LOOKUP_MOCK_MODE", "true");
    vi.stubEnv("BBR_MOCK_MODE", "true");
    vi.stubEnv("EJENDOMSVURDERING_MOCK_MODE", "true");
    vi.stubEnv("STOEJKORT_MOCK_MODE", "true");

    const first = await lookupProperty(input);
    const second = await lookupProperty(input);

    expect(first).toEqual(second);
    expect(first.dataMode).toBe("mock");
    expect(first.sources.every((s) => s.mode === "mock")).toBe(true);
    expect(first.bbrData).not.toBeNull();
    expect(first.publicValuation).not.toBeNull();
  });
});

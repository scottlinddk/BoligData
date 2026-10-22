import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupAddressCadastral } from "./address-lookup.js";
import { resetDatafordelerCache } from "./datafordeler.js";

beforeEach(() => {
  resetDatafordelerCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const HUSNUMMER_ID = "0a3f509c-38ed-32b8-e044-0003ba298018";
const ADRESSEPUNKT_ID = "1b4f509c-38ed-32b8-e044-0003ba298018";

const husnummerNode = {
  id_lokalId: HUSNUMMER_ID,
  adgangsadressebetegnelse: "Floravej 6, 9000 Aalborg",
  husnummertekst: "6",
  adgangspunkt: ADRESSEPUNKT_ID,
};

const connection = (nodes: unknown[], hasNextPage = false) => ({ nodes, pageInfo: { hasNextPage } });
const estates = (...bfe: number[]) => connection(bfe.map((BFEnummer) => ({ BFEnummer })));
const parcel = (matrikelnummer: string, bfe: number[] = [2340871]) => ({
  matrikelnummer,
  jordstykkeLiggerIEjerlav: { ejerlavskode: 610452, ejerlavsnavn: "Gl. Hasseris By, Hasseris" },
  jordstykkeSamlesISamletFastEjendom: estates(...bfe),
});
const parcelResponse = (parcels: unknown[], hasNextPage = false) => ({
  data: { DAR_Husnummer: connection([{ husnummerErPlaceretPaaJordstykke: connection(parcels, hasNextPage) }]) },
});
const husnummerResponse = (nodes: unknown[]) => ({ data: { DAR_Husnummer: connection(nodes) } });
const adressepunktResponse = {
  data: { DAR_Adressepunkt: connection([{ id_lokalId: ADRESSEPUNKT_ID, position: { wkt: "POINT (555784.21 6322850.06)", crs: "25832" } }]) },
};

interface Answers {
  husnummer?: unknown;
  adressepunkt?: unknown;
  parcel?: unknown | { status: number };
  adressevaelgerSearch?: unknown;
  adressevaelgerHusnummer?: unknown;
}

/** Routes by request, not by order: the access point and the parcel are fetched concurrently. */
function routeFetch(answers: Answers) {
  const requests: { url: string; query?: string }[] = [];
  const reply = (body: unknown) => ({ ok: true, status: 200, headers: new Headers(), json: async () => body });
  vi.spyOn(globalThis, "fetch").mockImplementation((async (url: unknown, init?: { body?: unknown }) => {
    const href = String(url);
    const query = typeof init?.body === "string" ? (JSON.parse(init.body).query as string) : undefined;
    requests.push({ url: href, query });
    if (href.includes("/Flexible/")) {
      const body = answers.parcel ?? parcelResponse([parcel("42q")]);
      const failure = (body as { status?: number }).status;
      return typeof failure === "number" ? { ok: false, status: failure, headers: new Headers(), json: async () => ({}) } : reply(body);
    }
    if (href.includes("/DAR/")) {
      return reply(query?.includes("AdressepunktLookup") ? (answers.adressepunkt ?? adressepunktResponse) : (answers.husnummer ?? husnummerResponse([husnummerNode])));
    }
    if (href.includes("husnumre/soeg")) return reply(answers.adressevaelgerSearch ?? { status: "ok", fund: [] });
    if (href.includes("adressevaelger.dk/husnumre/")) return reply(answers.adressevaelgerHusnummer ?? {});
    return reply({ error: `unexpected request ${href}` });
  }) as unknown as typeof fetch);
  return requests;
}

describe("lookupAddressCadastral (DAR)", () => {
  beforeEach(() => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
  });

  it("resolves identity, coordinates and the cadastral parcel from Datafordeler", async () => {
    const requests = routeFetch({});
    const result = await lookupAddressCadastral("Floravej 6, 9000 Aalborg", "9000");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      idLokalid: HUSNUMMER_ID,
      matrikelnr: "42q",
      ejerlav: "Gl. Hasseris By, Hasseris",
      ejerlavskode: "610452",
      bfeNummer: "2340871",
      postalCode: "9000",
      zone: null,
      resolvedVia: "dar",
    });
    // EPSG:25832 access point, projected back to WGS84.
    expect(result.data.lat).toBeCloseTo(57.05, 1);
    expect(result.data.lon).toBeCloseTo(9.92, 1);

    expect(requests.some((r) => r.url.includes("dataforsyningen.dk"))).toBe(false);
    const husnummerQuery = requests.find((r) => r.query?.includes("HusnummerLookup"))!.query!;
    // Both bitemporal arguments, the comma-terminated prefix and the current-status filter.
    expect(husnummerQuery).toContain("virkningstid:");
    expect(husnummerQuery).toContain("registreringstid:");
    expect(husnummerQuery).toContain('adgangsadressebetegnelse: { startsWith: "Floravej 6," }');
    expect(husnummerQuery).toContain('status: { eq: "3" }');
    expect(requests.find((r) => r.query?.includes("AdressepunktLookup"))!.query).toContain(`id_lokalId: { eq: "${ADRESSEPUNKT_ID}" }`);
    expect(requests.find((r) => r.url.includes("/Flexible/"))!.query).toContain(`id_lokalId: { eq: "${HUSNUMMER_ID}" }`);
  });

  it("leaves matrikelnr and ejerlav empty, but keeps a single BFE, when the husnummer sits on several parcels", async () => {
    routeFetch({ parcel: parcelResponse([parcel("42q"), parcel("42r")]) });
    const result = await lookupAddressCadastral("Floravej 6, 9000 Aalborg", "9000");

    expect(result.ok && result.data).toMatchObject({ matrikelnr: null, ejerlav: null, ejerlavskode: null, bfeNummer: "2340871" });
  });

  it("never picks a BFE when the husnummer maps to several estates", async () => {
    routeFetch({ parcel: parcelResponse([parcel("42q", [2340871, 42])]) });
    const result = await lookupAddressCadastral("Floravej 6, 9000 Aalborg", "9000");

    expect(result.ok && result.data.matrikelnr).toBe("42q");
    expect(result.ok && result.data.bfeNummer).toBeNull();
  });

  it("does not trust a truncated parcel page", async () => {
    routeFetch({ parcel: parcelResponse([parcel("42q")], true) });
    const result = await lookupAddressCadastral("Floravej 6, 9000 Aalborg", "9000");

    expect(result.ok && result.data).toMatchObject({ matrikelnr: null, bfeNummer: null });
  });

  it("keeps the address result when the parcel service fails", async () => {
    routeFetch({ parcel: { status: 500 } });
    const result = await lookupAddressCadastral("Floravej 6, 9000 Aalborg", "9000");

    expect(result.ok && result.data.idLokalid).toBe(HUSNUMMER_ID);
    expect(result.ok && result.data.matrikelnr).toBeNull();
    expect(result.ok && result.data.bfeNummer).toBeNull();
  });

  it("keeps the husnummer identity and the caller's coordinates when the access point cannot be read", async () => {
    routeFetch({ adressepunkt: { data: { DAR_Adressepunkt: connection([]) } } });
    const result = await lookupAddressCadastral("Floravej 6, 9000 Aalborg", "9000", 57.05, 9.92);

    expect(result.ok && result.data.idLokalid).toBe(HUSNUMMER_ID);
    expect(result.ok && result.data.lat).toBe(57.05);
    expect(result.ok && result.data.lon).toBe(9.92);
  });

  it("rejects a husnummer in another postcode instead of guessing", async () => {
    routeFetch({ husnummer: husnummerResponse([{ ...husnummerNode, adgangsadressebetegnelse: "Floravej 6, 9700 Brønderslev" }]) });
    const result = await lookupAddressCadastral("Floravej 6, 9000 Aalborg", "9000");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("DAR: no unique DAR husnummer match");
  });

  it("reports both failures when DAR and Adressevælger come up empty", async () => {
    routeFetch({ husnummer: husnummerResponse([]) });
    const result = await lookupAddressCadastral("Floravej 6, 9000 Aalborg", "9000");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("DAR:");
    expect(result.error).toContain("Adressevælger:");
  });

  it("falls back to Adressevælger when DAR has no match", async () => {
    routeFetch({
      husnummer: husnummerResponse([]),
      adressevaelgerSearch: { status: "ok", fund: [{ type: "husnummer", id: HUSNUMMER_ID, titel: "Floravej 6, 9000 Aalborg", vejnavn: "Floravej", husnummer: "6" }] },
      adressevaelgerHusnummer: {
        husnummer: {
          id_lokalid: HUSNUMMER_ID, husnummertekst: "6", vejnavn: "Floravej", adgangsadressebetegnelse: "Floravej 6, 9000 Aalborg",
          adgangspunkt: { koordinater: { x: 555784.21, y: 6322850.06 } },
          postnummer: { postnr: "9000", navn: "Aalborg" }, navngivenvejkommunedel: { kommune: "0851" },
        },
      },
    });
    const result = await lookupAddressCadastral("Floravej 6, 9000 Aalborg", "9000");

    expect(result.ok && result.data).toMatchObject({ idLokalid: HUSNUMMER_ID, resolvedVia: "adressevaelger", matrikelnr: null, municipalityCode: "0851" });
  });
});

describe("lookupAddressCadastral (no Datafordeler key)", () => {
  it("goes straight to Adressevælger and never calls Datafordeler", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "");
    const requests = routeFetch({});
    const result = await lookupAddressCadastral("Floravej 6, 9000 Aalborg", "9000");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("DATAFORDELER_API_KEY");
    expect(requests.every((r) => !r.url.includes("datafordeler.dk"))).toBe(true);
    expect(requests.some((r) => r.url.includes("husnumre/soeg"))).toBe(true);
  });
});

describe("lookupAddressCadastral (mock mode)", () => {
  it("only mocks when the flag is explicitly enabled", async () => {
    vi.stubEnv("ADDRESS_LOOKUP_MOCK_MODE", "true");
    const first = await lookupAddressCadastral("Testvej 1", "9000", 57.05, 9.92);
    const second = await lookupAddressCadastral("Testvej 1", "9000", 57.05, 9.92);

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.idLokalid).toMatch(/^mock-/);
    expect(["byzone", "landzone", "sommerhusomraade"]).toContain(first.data.zone);
  });

  it("returns different cadastral data for different addresses", async () => {
    vi.stubEnv("ADDRESS_LOOKUP_MOCK_MODE", "true");
    const a = await lookupAddressCadastral("Testvej 1", "9000", 57.05, 9.92);
    const b = await lookupAddressCadastral("Andenvej 2", "8000", 56.15, 10.2);
    expect(a).not.toEqual(b);
  });

  it("treats an unset flag as live, not as mock", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    const requests = routeFetch({});
    const result = await lookupAddressCadastral("Floravej 6, 9000 Aalborg", "9000");
    expect(requests[0]!.url).toContain("graphql.datafordeler.dk");
    expect(result.ok && result.data.idLokalid).not.toMatch(/^mock-/);
  });
});

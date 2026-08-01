import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupAddressCadastral, parseAdgangsadresse } from "./address-lookup.js";
import { stubFetch } from "../test-support/stub-fetch.js";

/** Shape of one DAWA /adgangsadresser record, trimmed to the fields this repo reads. */
const dawaRecord = {
  id: "0a3f507b-83d6-32b8-e044-0003ba298018",
  husnr: "6",
  vejstykke: { navn: "Floravej" },
  postnummer: { nr: "9000", navn: "Aalborg" },
  kommune: { kode: "0851", navn: "Aalborg" },
  adgangspunkt: { koordinater: [9.9187, 57.048] },
  jordstykke: { matrikelnr: "481i", ejerlav: { kode: 620551, navn: "Sofiendal, Aalborg Jorder" }, bfenummer: 2340871 },
  zone: "Byzone",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("parseAdgangsadresse", () => {
  it("maps the nested DAWA structure onto cadastral fields", () => {
    const parsed = parseAdgangsadresse(dawaRecord);
    expect(parsed).toEqual({
      idLokalid: "0a3f507b-83d6-32b8-e044-0003ba298018",
      matrikelnr: "481i",
      ejerlav: "Sofiendal, Aalborg Jorder",
      ejerlavskode: "620551",
      bfeNummer: "2340871",
      zone: "byzone",
      lat: 57.048,
      lon: 9.9187,
      postalCode: "9000",
      postalName: "Aalborg",
      municipalityCode: "0851",
      formattedAddress: "Floravej 6, 9000 Aalborg",
    });
  });

  it("reads the flat structure where cadastral fields sit at the top level", () => {
    const parsed = parseAdgangsadresse({
      id: "abc",
      matrikelnr: "7000a",
      ejerlav: { kode: "100", navn: "Flat Ejerlav" },
      zone: "Landzone",
    });
    expect(parsed?.matrikelnr).toBe("7000a");
    expect(parsed?.ejerlavskode).toBe("100");
    expect(parsed?.zone).toBe("landzone");
  });

  it("folds Danish zone spellings and numeric zone codes onto the ASCII union", () => {
    expect(parseAdgangsadresse({ id: "a", zone: "Sommerhusområde" })?.zone).toBe("sommerhusomraade");
    expect(parseAdgangsadresse({ id: "a", zone: 2 })?.zone).toBe("sommerhusomraade");
    expect(parseAdgangsadresse({ id: "a", zone: "Byzone" })?.zone).toBe("byzone");
    expect(parseAdgangsadresse({ id: "a", zone: "ukendt" })?.zone).toBeNull();
  });

  it("rejects coordinates outside Denmark rather than passing 0,0 downstream", () => {
    const parsed = parseAdgangsadresse({ id: "a", adgangspunkt: { koordinater: [0, 0] } });
    expect(parsed?.lat).toBeNull();
    expect(parsed?.lon).toBeNull();
  });
});

describe("lookupAddressCadastral (live)", () => {
  it("resolves an address against the address register", async () => {
    const stub = stubFetch([{ body: [dawaRecord] }]);
    const result = await lookupAddressCadastral("floravej 6 9000 aalborg", null);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.idLokalid).toBe("0a3f507b-83d6-32b8-e044-0003ba298018");
    expect(result.data.matrikelnr).toBe("481i");
    expect(result.data.lat).toBeCloseTo(57.048);
    expect(stub.urls[0]).toContain("api.dataforsyningen.dk/adgangsadresser");
    expect(stub.urls[0]).toContain("q=floravej+6+9000+aalborg");
    expect(stub.urls[0]).not.toContain("fuzzy");
  });

  it("retries once with fuzzy matching when the exact search finds nothing", async () => {
    const stub = stubFetch([{ body: [] }, { body: [dawaRecord] }]);
    const result = await lookupAddressCadastral("floravei 6", "9000");

    expect(result.ok).toBe(true);
    expect(stub.urls).toHaveLength(2);
    expect(stub.urls[1]).toContain("fuzzy=");
    expect(stub.urls[1]).toContain("postnr=9000");
  });

  it("fails rather than inventing identifiers when nothing matches", async () => {
    stubFetch([{ body: [] }, { body: [] }]);
    const result = await lookupAddressCadastral("ikke en adresse", null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("no address match");
  });

  it("keeps caller-supplied coordinates when the register has none", async () => {
    stubFetch([{ body: [{ ...dawaRecord, adgangspunkt: undefined }] }]);
    const result = await lookupAddressCadastral("Floravej 6", "9000", 57.05, 9.92);
    expect(result.ok && result.data.lat).toBe(57.05);
  });

  it("reports upstream failures instead of throwing", async () => {
    stubFetch([{ status: 400 }]);
    const result = await lookupAddressCadastral("Floravej 6", null);
    expect(result.ok).toBe(false);
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
    const stub = stubFetch([{ body: [dawaRecord] }]);
    const result = await lookupAddressCadastral("Floravej 6", "9000");
    expect(stub.urls).toHaveLength(1);
    expect(result.ok && result.data.idLokalid).not.toMatch(/^mock-/);
  });
});

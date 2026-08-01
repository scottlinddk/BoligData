import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupAddressCadastral, parcelUrl, parseAdgangsadresse } from "./address-lookup.js";
import { stubFetch } from "../test-support/stub-fetch.js";

/**
 * One DAWA /adgangsadresser record, trimmed to the fields this repo reads but
 * otherwise shaped exactly as the live API answers (captured 2026-08-01):
 * `zone` is the retired "Udfaset" placeholder, and `jordstykke` links to the
 * parcel rather than carrying its BFE number.
 */
const dawaRecord = {
  id: "0a3f509c-38ed-32b8-e044-0003ba298018",
  adressebetegnelse: "Floravej 6, 9000 Aalborg",
  husnr: "6",
  vejstykke: { navn: "Floravej" },
  postnummer: { nr: "9000", navn: "Aalborg" },
  kommune: { kode: "0851", navn: "Aalborg" },
  ejerlav: { kode: 610452, navn: "Gl. Hasseris By, Hasseris" },
  matrikelnr: "42q",
  adgangspunkt: { koordinater: [9.87640126, 57.04591973] },
  jordstykke: {
    href: "https://api.dataforsyningen.dk/jordstykker/610452/42q",
    ejerlav: { kode: 610452, navn: "Gl. Hasseris By, Hasseris" },
    matrikelnr: "42q",
    esrejendomsnr: "0",
  },
  zone: "Udfaset",
};

/** The linked /jordstykker record, which is where the BFE number lives. */
const parcelRecord = { matrikelnr: "42q", bfenummer: 2340871, registreretareal: 812 };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("parseAdgangsadresse", () => {
  it("maps a live DAWA record onto cadastral fields", () => {
    const parsed = parseAdgangsadresse(dawaRecord);
    expect(parsed).toEqual({
      idLokalid: "0a3f509c-38ed-32b8-e044-0003ba298018",
      matrikelnr: "42q",
      ejerlav: "Gl. Hasseris By, Hasseris",
      ejerlavskode: "610452",
      bfeNummer: null,
      zone: null,
      lat: 57.04591973,
      lon: 9.87640126,
      postalCode: "9000",
      postalName: "Aalborg",
      municipalityCode: "0851",
      formattedAddress: "Floravej 6, 9000 Aalborg",
    });
  });

  it("reads cadastral fields out of a nested jordstykke when one carries them", () => {
    const parsed = parseAdgangsadresse({
      id: "abc",
      jordstykke: { matrikelnr: "481i", ejerlav: { kode: 620551, navn: "Sofiendal" }, bfenummer: 2340871 },
    });
    expect(parsed?.matrikelnr).toBe("481i");
    expect(parsed?.ejerlavskode).toBe("620551");
    expect(parsed?.bfeNummer).toBe("2340871");
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

  it("maps DAWA's retired zone placeholder to null rather than a bogus zone", () => {
    expect(parseAdgangsadresse({ id: "a", zone: "Udfaset" })?.zone).toBeNull();
  });

  it("rejects coordinates outside Denmark rather than passing 0,0 downstream", () => {
    const parsed = parseAdgangsadresse({ id: "a", adgangspunkt: { koordinater: [0, 0] } });
    expect(parsed?.lat).toBeNull();
    expect(parsed?.lon).toBeNull();
  });
});

describe("parcelUrl", () => {
  it("prefers the link the address record already carries", () => {
    expect(parcelUrl(dawaRecord)).toBe("https://api.dataforsyningen.dk/jordstykker/610452/42q");
  });

  it("composes the parcel URL from ejerlav code and matrikelnr when there is no link", () => {
    const record = { id: "a", jordstykke: { ejerlav: { kode: 610452 }, matrikelnr: "42q" } };
    expect(parcelUrl(record)).toBe("https://api.dataforsyningen.dk/jordstykker/610452/42q");
  });

  it("returns null when the address has no parcel at all", () => {
    expect(parcelUrl({ id: "a" })).toBeNull();
  });
});

describe("lookupAddressCadastral (live)", () => {
  it("resolves an address against the address register", async () => {
    const stub = stubFetch([{ body: [dawaRecord] }, { body: parcelRecord }]);
    const result = await lookupAddressCadastral("floravej 6 9000 aalborg", null);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.idLokalid).toBe("0a3f509c-38ed-32b8-e044-0003ba298018");
    expect(result.data.matrikelnr).toBe("42q");
    expect(result.data.ejerlav).toBe("Gl. Hasseris By, Hasseris");
    expect(result.data.lat).toBeCloseTo(57.0459);
    expect(stub.urls[0]).toContain("api.dataforsyningen.dk/adgangsadresser");
    expect(stub.urls[0]).toContain("q=floravej+6+9000+aalborg");
    expect(stub.urls[0]).not.toContain("fuzzy");
  });

  it("follows the parcel link to pick up the BFE number VUR is keyed by", async () => {
    const stub = stubFetch([{ body: [dawaRecord] }, { body: parcelRecord }]);
    const result = await lookupAddressCadastral("Floravej 6", "9000");

    expect(result.ok && result.data.bfeNummer).toBe("2340871");
    expect(stub.urls[1]).toBe("https://api.dataforsyningen.dk/jordstykker/610452/42q");
  });

  it("keeps the address result when the parcel lookup fails", async () => {
    stubFetch([{ body: [dawaRecord] }, { status: 404 }]);
    const result = await lookupAddressCadastral("Floravej 6", "9000");

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.bfeNummer).toBeNull();
    expect(result.ok && result.data.matrikelnr).toBe("42q");
  });

  it("retries once with fuzzy matching when the exact search finds nothing", async () => {
    const stub = stubFetch([{ body: [] }, { body: [dawaRecord] }, { body: parcelRecord }]);
    const result = await lookupAddressCadastral("floravei 6", "9000");

    expect(result.ok).toBe(true);
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
    stubFetch([{ body: [{ ...dawaRecord, adgangspunkt: undefined }] }, { body: parcelRecord }]);
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
    const stub = stubFetch([{ body: [dawaRecord] }, { body: parcelRecord }]);
    const result = await lookupAddressCadastral("Floravej 6", "9000");
    expect(stub.urls[0]).toContain("api.dataforsyningen.dk");
    expect(result.ok && result.data.idLokalid).not.toMatch(/^mock-/);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { isHusnummerId, lookupHusnummerById, parseHusnummer, pickExactHusnummer } from "./adressevaelger.js";
import { stubFetch } from "../test-support/stub-fetch.js";

const ID = "0a3f509c-38ed-32b8-e044-0003ba298018";

/** `GET /husnumre/{id}` for Floravej 6, trimmed to the fields read, shaped as the live API answered on 2026-10-17. */
const liveBody = {
  status: "ok",
  husnummer: {
    id_lokalid: ID,
    husnummertekst: "6",
    adgangsadressebetegnelse: "Floravej 6, 9000 Aalborg",
    vejnavn: "Floravej",
    status: "3",
    adgangspunkt: {
      id_lokalid: ID,
      geometri: { type: "Point", crs: { type: "name", properties: { name: "EPSG:25832" } }, coordinates: [553173.08, 6322838.76] },
      koordinater: { x: 553173.08, y: 6322838.76 },
    },
    postnummer: { navn: "Aalborg", postnr: "9000" },
    navngivenvejkommunedel: { kommune: "0851", vejkode: "2005" },
  },
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isHusnummerId", () => {
  it("accepts a DAR UUID and rejects anything that could alter the request path", () => {
    expect(isHusnummerId(ID)).toBe(true);
    expect(isHusnummerId(ID.toUpperCase())).toBe(true);
    for (const bad of ["", "abc", `${ID}/adresser`, `../${ID}`, `${ID}?token=x`, 42, null, undefined]) {
      expect(isHusnummerId(bad)).toBe(false);
    }
  });
});

describe("parseHusnummer", () => {
  it("maps identity, municipality, postal code and WGS84 coordinates, leaving the parcel unresolved", () => {
    const parsed = parseHusnummer(liveBody);
    expect(parsed).toMatchObject({
      idLokalid: ID,
      formattedAddress: "Floravej 6, 9000 Aalborg",
      streetName: "Floravej",
      houseNumber: "6",
      postalCode: "9000",
      postalName: "Aalborg",
      municipalityCode: "0851",
      resolvedVia: "adressevaelger",
      // Not carried by this register: reported as unknown rather than guessed.
      matrikelnr: null,
      ejerlav: null,
      ejerlavskode: null,
      bfeNummer: null,
      zone: null,
    });
    expect(parsed?.lat).toBeCloseTo(57.04591973, 6);
    expect(parsed?.lon).toBeCloseTo(9.87640126, 6);
  });

  it("keeps the identity but drops coordinates that fall outside Denmark", () => {
    const body = structuredClone(liveBody);
    body.husnummer.adgangspunkt.koordinater = { x: 100, y: 100 };
    const parsed = parseHusnummer(body);
    expect(parsed?.idLokalid).toBe(ID);
    expect(parsed?.lat).toBeNull();
    expect(parsed?.lon).toBeNull();
  });

  it("returns null for bodies without a husnummer", () => {
    expect(parseHusnummer({ status: "ok" })).toBeNull();
    expect(parseHusnummer(null)).toBeNull();
    expect(parseHusnummer([])).toBeNull();
  });
});

describe("lookupHusnummerById", () => {
  it("requests the id with the default token and resolves the address", async () => {
    const stub = stubFetch([{ body: liveBody }]);
    const result = await lookupHusnummerById(ID);
    expect(result.ok).toBe(true);
    expect(stub.urls).toEqual([`https://adressevaelger.dk/husnumre/${ID}?token=adressevaelger123`]);
  });

  it("honours a configured base URL and token", async () => {
    vi.stubEnv("ADRESSEVAELGER_API_BASE", "https://example.test/av/");
    vi.stubEnv("ADRESSEVAELGER_TOKEN", "a-private-token-1");
    const stub = stubFetch([{ body: liveBody }]);
    await lookupHusnummerById(ID);
    expect(stub.urls).toEqual([`https://example.test/av/husnumre/${ID}?token=a-private-token-1`]);
  });

  it("does not call the network for an invalid id", async () => {
    const stub = stubFetch([{ body: liveBody }]);
    const result = await lookupHusnummerById("../etc/passwd");
    expect(result).toEqual({ ok: false, error: "husnummer id is not a valid UUID" });
    expect(stub.urls).toEqual([]);
  });

  it("reports an unknown id as unavailable without echoing the token", async () => {
    vi.stubEnv("ADRESSEVAELGER_TOKEN", "a-private-token-1");
    stubFetch([{ status: 404 }]);
    const result = await lookupHusnummerById(ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("404");
      expect(result.error).not.toContain("a-private-token-1");
    }
  });

  it("fails when the register answers 200 with no usable husnummer", async () => {
    stubFetch([{ body: { status: "ok" } }]);
    const result = await lookupHusnummerById(ID);
    expect(result).toEqual({ ok: false, error: "Adressevælger returned no husnummer for this id" });
  });
});

describe("pickExactHusnummer", () => {
  const A = "0a3f509c-4f33-32b8-e044-0003ba298018";
  const B = "0a3f509c-6551-32b8-e044-0003ba298018";
  const hit = (id: string, vejnavn: string, husnummer: string, postnr: string) => ({ type: "husnummer", id, vejnavn, husnummer, titel: `${vejnavn} ${husnummer}, ${postnr} By` });
  const wanted = { streetName: "Hasserisgade", houseNumber: "3", postalCode: "9000" };

  it("takes the one hit on this street, number and postcode, ignoring case", () => {
    expect(pickExactHusnummer({ fund: [hit(B, "Hasserisgade", "3A", "9000"), hit(A, "hasserisgade", "3", "9000")] }, wanted)).toBe(A);
  });
  it("never takes another number, street or postcode", () => {
    expect(pickExactHusnummer({ fund: [hit(A, "Hasserisgade", "3A", "9000")] }, wanted)).toBeNull();
    expect(pickExactHusnummer({ fund: [hit(A, "Hasserisvej", "3", "9000")] }, wanted)).toBeNull();
    expect(pickExactHusnummer({ fund: [hit(A, "Hasserisgade", "3", "9200")] }, wanted)).toBeNull();
  });
  it("refuses two equally exact hits when no postcode tells them apart", () => {
    const body = { fund: [hit(A, "Hasserisgade", "3", "9000"), hit(B, "Hasserisgade", "3", "9200")] };
    expect(pickExactHusnummer(body, { ...wanted, postalCode: null })).toBeNull();
    expect(pickExactHusnummer(body, wanted)).toBe(A);
  });
  it("ignores street-level hits and malformed bodies", () => {
    expect(pickExactHusnummer({ fund: [{ type: "navngivenvej", titel: "Hasserisgade" }] }, wanted)).toBeNull();
    expect(pickExactHusnummer(null, wanted)).toBeNull();
  });
});

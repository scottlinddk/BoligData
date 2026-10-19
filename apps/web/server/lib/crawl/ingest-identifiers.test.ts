import { describe, expect, it } from "vitest";
import { withStoredIdentifiers } from "./ingest.js";
import type { AddressCadastral } from "../enrichment-sources/address-lookup.js";

const stored = { idLokalid: "0a3f509c-4f33-32b8-e044-0003ba298018", matrikelnr: "327b", ejerlav: "Aalborg Bygrunde", zone: null, bfeNummer: "123456" };
const fresh: AddressCadastral = {
  idLokalid: "0a3f509c-6551-32b8-e044-0003ba298018", matrikelnr: null, ejerlav: null, ejerlavskode: null, bfeNummer: null, zone: null,
  lat: 57.05, lon: 9.91, postalCode: "9000", postalName: "Aalborg", municipalityCode: "0851", formattedAddress: "Kastetvej 15A, 9000 Aalborg",
  resolvedVia: "adressevaelger",
};

describe("withStoredIdentifiers", () => {
  it("keeps the stored identifiers when this run's lookup failed, instead of wiping them", () => {
    expect(withStoredIdentifiers(null, stored)).toMatchObject({ ...stored, resolvedVia: "stored" });
  });
  it("lets a fresh value win and fills only the gaps (Adressevælger carries no parcel)", () => {
    expect(withStoredIdentifiers(fresh, stored)).toMatchObject({ idLokalid: fresh.idLokalid, matrikelnr: "327b", bfeNummer: "123456", municipalityCode: "0851", resolvedVia: "adressevaelger" });
  });
  it("has nothing to offer when neither a lookup nor a stored identifier exists", () => {
    expect(withStoredIdentifiers(null, null)).toBeNull();
    expect(withStoredIdentifiers(null, { idLokalid: null, matrikelnr: null, ejerlav: null, zone: null, bfeNummer: null })).toBeNull();
    expect(withStoredIdentifiers(fresh, null)).toBe(fresh);
  });
});

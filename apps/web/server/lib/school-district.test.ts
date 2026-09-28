import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupSchoolDistrict } from "./school-district.js";

const addressId = "0a3f509c-b58c-32b8-e044-0003ba298018";
const input = { address: "Slåenvej 18", postalCode: "9000", idLokalid: addressId, dataMode: "real" };
// Trimmed live response from the user-supplied endpoint, checked 2026-09-28.
const fixture = {
  address: { fullAddress: "Slåenvej 18, 9000 Aalborg", municipalityCode: "851", municipalityName: "Aalborg", municipalitySlug: "aalborg" },
  matches: [{ schoolName: "Gl. Hasseris Skole", schoolSlug: "gl-hasseris-skole", starttrin: 0, sluttrin: 9 }],
  confidence: "high", source: "CACHE", disclaimer: "Resultatet er vejledende og baseret på offentlige datakilder fra GeoFA og LIFA AdresseService.",
};
const suggestion = { id: addressId, label: fixture.address.fullAddress, streetName: "Slåenvej", houseNumber: "18", postalCode: "9000", city: "Aalborg", kind: "husnummer" };

function upstream(...bodies: unknown[]) {
  const fetch = vi.fn();
  bodies.forEach(body => fetch.mockResolvedValueOnce({ ok: true, json: async () => body }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

describe("school district lookup", () => {
  it("reads the real source shape with grade zero, confidence, attribution and verified profile links", async () => {
    const fetch = upstream(fixture);
    const result = await lookupSchoolDistrict(input);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toBe(`https://skoledistrikt.dk/api/school-district/by-address?id=${addressId}`);
    expect(result).toMatchObject({ status: "available", reason: null, addressId, address: fixture.address.fullAddress,
      municipality: "Aalborg", confidence: "high", source: "CACHE", disclaimer: fixture.disclaimer,
      matches: [{ schoolName: "Gl. Hasseris Skole", firstGrade: 0, lastGrade: 9, schoolUrl: "https://skoledistrikt.dk/skole/aalborg/gl-hasseris-skole" }] });
    expect(Number.isFinite(Date.parse(result.checkedAt))).toBe(true);
  });

  it("resolves a missing DAR ID using one exact entrance match, including unit listings", async () => {
    const fetch = upstream([
      { ...suggestion, houseNumber: "180", label: "Slåenvej 180, 9000 Aalborg" },
      suggestion,
      { ...suggestion, id: "0a3f509c-b58d-32b8-e044-0003ba298018", postalCode: "9200", label: "Slåenvej 18, 9200 Aalborg SV" },
    ], fixture);
    expect((await lookupSchoolDistrict({ ...input, address: "slåenvej 18, 2. tv", idLokalid: null })).status).toBe("available");
    const url = new URL(fetch.mock.calls[0]?.[0]);
    expect(url.pathname).toBe("/api/address/autocomplete");
    expect(url.searchParams.get("q")).toBe("slåenvej 18, 9000");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    { address: "Hobrovej 1000", postalCode: "9200" },
    { address: "Hobrovej 1000, 9200 Aalborg SV", postalCode: "9200" },
    { address: "Hobrovej 1000, 2. tv, 9200 Aalborg SV", postalCode: null },
  ])("keeps four-digit house numbers separate from postcodes: $address", async changes => {
    upstream({ ...fixture, address: { ...fixture.address, fullAddress: "Hobrovej 1000, 9200 Aalborg SV" } });
    expect(await lookupSchoolDistrict({ ...input, ...changes })).toMatchObject({ status: "available", address: "Hobrovej 1000, 9200 Aalborg SV" });
  });

  it("resolves four-digit house numbers through autocomplete without confusing its label postcode", async () => {
    const fullAddress = "Hobrovej 1000, 9200 Aalborg SV";
    const fetch = upstream([{ ...suggestion, label: fullAddress, streetName: "Hobrovej", houseNumber: "1000", postalCode: "9200" }],
      { ...fixture, address: { ...fixture.address, fullAddress } });
    expect(await lookupSchoolDistrict({ ...input, address: "Hobrovej 1000", postalCode: "9200", idLokalid: null })).toMatchObject({ status: "available", address: fullAddress });
    expect(new URL(fetch.mock.calls[0]?.[0]).searchParams.get("q")).toBe("Hobrovej 1000, 9200");
  });

  it("does not invent a postcode from a four-digit house number or ignore a real postcode conflict", async () => {
    const fetch = upstream();
    expect(await lookupSchoolDistrict({ ...input, address: "Hobrovej 1000", postalCode: null })).toMatchObject({ status: "unavailable", reason: "address_missing" });
    expect(await lookupSchoolDistrict({ ...input, address: "Hobrovej 1000, 9200 Aalborg SV" })).toMatchObject({ status: "unavailable", reason: "address_mismatch" });
    expect(fetch).not.toHaveBeenCalled();
    upstream({ ...fixture, address: { ...fixture.address, fullAddress: "Hobrovej 1000, 9000 Aalborg" } });
    expect(await lookupSchoolDistrict({ ...input, address: "Hobrovej 1000", postalCode: "9200" })).toMatchObject({ status: "unavailable", reason: "address_mismatch" });
  });

  it.each([
    { candidates: [{ ...suggestion, kind: "vejnavn" }], reason: "address_missing" },
    { candidates: [{ ...suggestion, houseNumber: "180" }], reason: "address_missing" },
    { candidates: [{ ...suggestion, label: "Slåenvej 19, 9000 Aalborg" }], reason: "address_missing" },
    { candidates: [suggestion, { ...suggestion, id: "0a3f509c-b58d-32b8-e044-0003ba298018" }], reason: "address_ambiguous" },
    { candidates: [], reason: "address_missing" },
    { candidates: { error: "No data" }, reason: "invalid_response" },
  ])("never chooses a fuzzy, ambiguous or non-address suggestion ($reason)", async ({ candidates, reason }) => {
    const fetch = upstream(candidates);
    expect(await lookupSchoolDistrict({ ...input, idLokalid: null })).toMatchObject({ status: "unavailable", reason, matches: [] });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(["Slåenvej 19, 9000 Aalborg", "Slåenvej 18, 9200 Aalborg SV", "Floravej 18, 9000 Aalborg"])("rejects a wrong address returned for a stored ID: %s", async fullAddress => {
    upstream({ ...fixture, address: { ...fixture.address, fullAddress } });
    expect(await lookupSchoolDistrict(input)).toMatchObject({ status: "unavailable", reason: "address_mismatch", address: null, matches: [] });
  });

  it("preserves multiple districts/grade ranges and does not turn missing grades into zero", async () => {
    upstream({ ...fixture, confidence: "low", matches: [fixture.matches[0], { schoolName: "Overbygningsskole", starttrin: 7, sluttrin: 10 }, { schoolName: "Anden skole", starttrin: null, sluttrin: null }] });
    const result = await lookupSchoolDistrict(input);
    expect(result.confidence).toBe("low");
    expect(result.matches.map(s => [s.firstGrade, s.lastGrade])).toEqual([[0, 9], [7, 10], [null, null]]);
  });

  it("distinguishes a successful empty result from unavailable or malformed data", async () => {
    upstream({ ...fixture, matches: [] });
    expect(await lookupSchoolDistrict(input)).toMatchObject({ status: "not_found", reason: null, address: fixture.address.fullAddress, matches: [] });
    upstream({ ...fixture, matches: [{ schoolSlug: "missing-name" }] });
    expect(await lookupSchoolDistrict(input)).toMatchObject({ status: "unavailable", reason: "invalid_response", matches: [] });
  });

  it("does not construct unsafe links or assert malformed grade ranges", async () => {
    upstream({ ...fixture, confidence: "something-new", matches: [{ schoolName: "School", schoolSlug: "../elsewhere", starttrin: 10, sluttrin: 0 }] });
    expect(await lookupSchoolDistrict(input)).toMatchObject({ status: "available", confidence: "unknown", matches: [{ schoolName: "School", schoolUrl: null, firstGrade: null, lastGrade: null }] });
  });

  it.each([429, 500, 404])("isolates HTTP %i without claiming no school district", async status => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status });
    vi.stubGlobal("fetch", fetch);
    expect(await lookupSchoolDistrict(input)).toMatchObject({ status: "unavailable", reason: "upstream_unavailable", matches: [] });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("isolates network and JSON failures and bounds requests with an abort signal", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error("private upstream detail"))
      .mockResolvedValueOnce({ ok: true, json: async () => { throw new Error("invalid JSON"); } });
    vi.stubGlobal("fetch", fetch);
    expect(await lookupSchoolDistrict(input)).toMatchObject({ status: "unavailable", reason: "upstream_unavailable" });
    expect(await lookupSchoolDistrict(input)).toMatchObject({ status: "unavailable", reason: "upstream_unavailable" });
    expect(fetch.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    { address: "Unknown", reason: "address_missing" },
    { postalCode: null, reason: "address_missing" },
    { address: "Slåenvej 18, 9200 Aalborg SV", reason: "address_mismatch" },
    { dataMode: "mock", reason: "nonlive_data" }, { dataMode: "demo", reason: "nonlive_data" },
  ])("does not call the source for unresolvable or simulated listings ($reason)", async ({ reason, ...changes }) => {
    const fetch = upstream();
    expect(await lookupSchoolDistrict({ ...input, ...changes })).toMatchObject({ status: "unavailable", reason });
    expect(fetch).not.toHaveBeenCalled();
  });
});

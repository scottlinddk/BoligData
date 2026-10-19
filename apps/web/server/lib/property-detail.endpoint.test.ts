import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { ListingDetails } from "../../../../packages/shared/src/types/index.js";
import handler from "../../api/properties.js";
import { requireUser } from "../middleware/auth.js";
import { fetchBoligsidenDetails } from "./boligsiden-listing-details.js";

const { from, propertySingle, enrichmentSingle } = vi.hoisted(() => ({
  from: vi.fn(), propertySingle: vi.fn(), enrichmentSingle: vi.fn(),
}));
vi.mock("../middleware/auth.js", () => ({ requireUser: vi.fn(), getOptionalUser: vi.fn() }));
vi.mock("./supabase.js", () => ({ getAnonClient: () => ({ from }) }));
vi.mock("./boligsiden-listing-details.js", () => ({ fetchBoligsidenDetails: vi.fn() }));

const id = "9dfbb273-37da-4e21-b8c7-f482d2aae19d";
const externalId = "60af38e8-559d-4eee-b8f3-1bfb89bf2c93";
const storedProperty = {
  id, external_id: externalId, listing_source: "boligsiden", data_mode: "real",
  address: "Skytten 1A", municipality: "Aalborg", postal_code: "9200",
  price: 1_295_000, sqm: 78, lat: 57.011, lon: 9.917,
  status: "active", property_type: "apartment", building_year: 1970, rooms: 3,
  description: "Bejsebakkekvarteret", listing_url: "https://www.boligsiden.dk/adresse/skytten-1a",
  created_at: "2026-09-01T12:00:00Z", updated_at: "2026-09-27T12:00:00Z",
};
const details: ListingDetails = {
  source: "boligsiden", sourceUrl: storedProperty.listing_url,
  title: "Lejlighed med vestvendt altan og kig mod byen",
  description: "På Skytten 1A finder du en velindrettet lejlighed.\n\nEn vestvendt altan har udsigt mod byen.",
  fetchedAt: "2026-09-28T12:00:00Z",
  facts: {
    yearBuilt: 1970, renovationYear: null, energyLabel: "B", areaSqm: 78,
    buildingType: "Etagebolig-bygning", floors: 4, roofMaterial: "Tagpap", wallMaterial: "Mursten",
    heatingInstallation: "Fjernvarme/blokvarme", basementSqm: null, toiletCount: 1, bathroomCount: 1,
    landAreaSqm: null,
    publicValuation: { assessedPropertyValueDkk: 1_100_000, assessedLandValueDkk: null, valuationYear: null },
  },
};

function request(query: Record<string, string> = { id }): VercelRequest {
  return { method: "GET", query, headers: { authorization: "Bearer token" } } as unknown as VercelRequest;
}

function response() {
  const result = { statusCode: 0, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader(name: string, value: string) { result.headers[name.toLowerCase()] = value; return res; },
    status(code: number) { result.statusCode = code; return res; },
    json(body: unknown) { result.body = body; return res; },
    end() { return res; },
  };
  return { result, res: res as unknown as VercelResponse };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ userId: "user-1", jwt: "token" });
  from.mockImplementation((table: string) => ({
    select: () => ({ eq: () => table === "properties" ? { single: propertySingle } : { maybeSingle: enrichmentSingle } }),
  }));
  propertySingle.mockResolvedValue({ data: { ...storedProperty }, error: null });
  enrichmentSingle.mockResolvedValue({ data: null, error: null });
  vi.mocked(fetchBoligsidenDetails).mockResolvedValue(details);
});

describe("property detail listing supplement", () => {
  it("adds the full broker text and facts to existing rows while preserving the stored listing", async () => {
    const { res, result } = response();
    await handler(request({ id, externalId: "untrusted-case", postalCode: "1000" }), res);

    expect(result.statusCode).toBe(200);
    expect(result.headers["cache-control"]).toBe("private, no-store");
    expect(result.body).toMatchObject({
      property: { id, address: "Skytten 1A", description: "Bejsebakkekvarteret", price: 1_295_000 },
      enrichment: null,
      listingDetails: details,
    });
    expect(fetchBoligsidenDetails).toHaveBeenCalledOnce();
    expect(fetchBoligsidenDetails).toHaveBeenCalledWith(externalId, expect.objectContaining({ postalCode: "9200" }));
  });

  it.each(["unknown", undefined])("supplements legacy rows with data mode %s without upgrading their stored provenance", async (dataMode) => {
    propertySingle.mockResolvedValue({ data: { ...storedProperty, data_mode: dataMode }, error: null });
    const { res, result } = response();
    await handler(request(), res);

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      property: { id, dataMode: "unknown", description: storedProperty.description },
      enrichment: null, listingDetails: details,
    });
    expect(fetchBoligsidenDetails).toHaveBeenCalledOnce();
    expect(fetchBoligsidenDetails).toHaveBeenCalledWith(externalId, expect.objectContaining({ postalCode: "9200" }));
  });

  it.each([
    { listing_source: "boliga", data_mode: "real" },
    { listing_source: "boligsiden", data_mode: "mock" },
    { listing_source: "boligsiden", data_mode: "demo" },
  ])("does not fetch live Boligsiden data for $listing_source/$data_mode rows", async (overrides) => {
    propertySingle.mockResolvedValue({ data: { ...storedProperty, ...overrides }, error: null });
    const { res, result } = response();
    await handler(request(), res);

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ property: { id, description: storedProperty.description }, listingDetails: null });
    expect(fetchBoligsidenDetails).not.toHaveBeenCalled();
  });

  it.each(["unavailable", "rejected"])("keeps the stored listing usable when supplemental data is %s", async (failure) => {
    if (failure === "rejected") vi.mocked(fetchBoligsidenDetails).mockRejectedValue(new Error("Source timeout"));
    else vi.mocked(fetchBoligsidenDetails).mockResolvedValue(null);
    const { res, result } = response();
    await handler(request(), res);

    expect(result.statusCode).toBe(200);
    expect(result.headers["cache-control"]).toBe("private, no-store");
    expect(result.body).toMatchObject({
      property: { id, address: storedProperty.address, description: storedProperty.description, price: storedProperty.price },
      enrichment: null, listingDetails: null,
    });
  });

  it("keeps source-reported building facts separate from verified register enrichment", async () => {
    enrichmentSingle.mockResolvedValue({
      data: {
        id: "enrichment-1", property_id: id, source: "datafordeler",
        bbr_data: { floors: 3, roofMaterial: "Tegl" },
        source_status: { bbr: { dataMode: "real" } },
      },
      error: null,
    });
    const { res, result } = response();
    await handler(request(), res);

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      enrichment: { bbrData: { floors: 3, roofMaterial: "Tegl" } },
      listingDetails: { facts: { floors: 4, roofMaterial: "Tagpap" } },
    });
  });

  it("requires authentication before database or source requests", async () => {
    vi.mocked(requireUser).mockImplementation(async (_req, res) => {
      res.status(401).json({ error: "Missing bearer token" });
      return null;
    });
    const { res, result } = response();
    await handler(request(), res);

    expect(result.statusCode).toBe(401);
    expect(from).not.toHaveBeenCalled();
    expect(fetchBoligsidenDetails).not.toHaveBeenCalled();
  });

  it("does not query the source for a missing or inaccessible property", async () => {
    propertySingle.mockResolvedValue({ data: null, error: { message: "not found" } });
    const { res, result } = response();
    await handler(request(), res);

    expect(result.statusCode).toBe(404);
    expect(fetchBoligsidenDetails).not.toHaveBeenCalled();
  });
});

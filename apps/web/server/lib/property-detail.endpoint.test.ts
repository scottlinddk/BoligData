import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../api/properties.js";
import { requireUser } from "../middleware/auth.js";

const { from, propertySingle, enrichmentSingle } = vi.hoisted(() => ({
  from: vi.fn(), propertySingle: vi.fn(), enrichmentSingle: vi.fn(),
}));
vi.mock("../middleware/auth.js", () => ({ requireUser: vi.fn(), getOptionalUser: vi.fn() }));
vi.mock("./supabase.js", () => ({ getAnonClient: () => ({ from }) }));

const id = "9dfbb273-37da-4e21-b8c7-f482d2aae19d";
const storedProperty = {
  id, external_id: "address-1", listing_source: "address_lookup", data_mode: "real",
  address: "Skytten 1A", municipality: "Aalborg", postal_code: "9200",
  price: 1_295_000, sqm: 78, lat: 57.011, lon: 9.917,
  status: "active", property_type: "apartment", building_year: 1970, rooms: 3,
  created_at: "2026-09-01T12:00:00Z", updated_at: "2026-09-27T12:00:00Z",
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
});

describe("property detail", () => {
  it("returns the stored property and never calls an external listing source", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { res, result } = response();
    await handler(request(), res);

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ property: { id, address: "Skytten 1A" }, enrichment: null });
    expect(result.body).not.toHaveProperty("listingDetails");
    expect(result.headers["cache-control"]).toBe("private, no-store");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps register enrichment separate from the stored property", async () => {
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
    expect(result.body).toMatchObject({ enrichment: { bbrData: { floors: 3, roofMaterial: "Tegl" } } });
  });

  it("requires authentication before database requests", async () => {
    vi.mocked(requireUser).mockImplementation(async (_req, res) => {
      res.status(401).json({ error: "Missing bearer token" });
      return null;
    });
    const { res, result } = response();
    await handler(request(), res);

    expect(result.statusCode).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing or inaccessible property", async () => {
    propertySingle.mockResolvedValue({ data: null, error: { message: "not found" } });
    const { res, result } = response();
    await handler(request(), res);

    expect(result.statusCode).toBe(404);
  });
});

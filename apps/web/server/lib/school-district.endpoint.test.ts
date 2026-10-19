import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../api/properties.js";
import { requireUser } from "../middleware/auth.js";
import { lookupSchoolDistrict } from "./school-district.js";

const { from, single, select, eq } = vi.hoisted(() => ({ from: vi.fn(), single: vi.fn(), select: vi.fn(), eq: vi.fn() }));
vi.mock("../middleware/auth.js", () => ({ requireUser: vi.fn(), getOptionalUser: vi.fn() }));
vi.mock("./supabase.js", () => ({ getAnonClient: () => ({ from }) }));
vi.mock("./school-district.js", () => ({ lookupSchoolDistrict: vi.fn() }));

const id = "0a3f509c-b58c-32b8-e044-0003ba298018";
const schoolResult: Awaited<ReturnType<typeof lookupSchoolDistrict>> = {
  status: "available", reason: null, addressId: id, address: "Slåenvej 18, 9000 Aalborg", municipality: "Aalborg",
  matches: [{ schoolName: "Gl. Hasseris Skole", schoolUrl: null, firstGrade: 0, lastGrade: 9 }],
  confidence: "high", provider: "skoledistrikt", source: "CACHE", sourceUrl: `https://skoledistrikt.dk/api/school-district/by-address?id=${id}`,
  checkedAt: "2026-09-28T12:00:00Z", disclaimer: null,
};
function request(query: Record<string, string> = { id, resource: "school-district" }): VercelRequest {
  return { method: "GET", query, headers: { authorization: "Bearer token" } } as unknown as VercelRequest;
}
function response() {
  const result = { statusCode: 0, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader(name: string, value: string) { result.headers[name.toLowerCase()] = value; return res; },
    status(code: number) { result.statusCode = code; return res; },
    json(body: unknown) { result.body = body; return res; }, end() { return res; },
  };
  return { result, res: res as unknown as VercelResponse };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ userId: "user-1", jwt: "token" });
  from.mockReturnValue({ select }); select.mockReturnValue({ eq }); eq.mockReturnValue({ single });
  single.mockResolvedValue({ data: { address: "Slåenvej 18", postal_code: "9000", id_lokalid: id, data_mode: "real" }, error: null });
  vi.mocked(lookupSchoolDistrict).mockResolvedValue(schoolResult);
});

describe("school district property resource", () => {
  it("uses stored property identity and private caching inside the existing endpoint", async () => {
    const { res, result } = response();
    await handler(request({ id, resource: "school-district", address: "Untrusted address", url: "https://example.org" }), res);
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual(schoolResult);
    expect(result.headers["cache-control"]).toBe("private, no-store");
    expect(from).toHaveBeenCalledWith("properties");
    expect(eq).toHaveBeenCalledWith("id", id);
    expect(lookupSchoolDistrict).toHaveBeenCalledWith({ address: "Slåenvej 18", postalCode: "9000", idLokalid: id, dataMode: "real" });
  });

  it("requires authentication before any property or public-source read", async () => {
    vi.mocked(requireUser).mockImplementation(async (_req, res) => { res.status(401).json({ error: "Missing bearer token" }); return null; });
    const { res, result } = response();
    await handler(request(), res);
    expect(result.statusCode).toBe(401);
    expect(from).not.toHaveBeenCalled(); expect(lookupSchoolDistrict).not.toHaveBeenCalled();
  });

  it("rejects invalid IDs before authentication/source work", async () => {
    const { res, result } = response();
    await handler(request({ id: "bad", resource: "school-district" }), res);
    expect(result.statusCode).toBe(400);
    expect(from).not.toHaveBeenCalled(); expect(lookupSchoolDistrict).not.toHaveBeenCalled();
  });

  it("does not query the district of a missing or inaccessible property", async () => {
    single.mockResolvedValue({ data: null, error: { message: "not found" } });
    const { res, result } = response();
    await handler(request(), res);
    expect(result.statusCode).toBe(404);
    expect(lookupSchoolDistrict).not.toHaveBeenCalled();
  });

  it("returns source unavailability as a structured result without failing the listing", async () => {
    vi.mocked(lookupSchoolDistrict).mockResolvedValue({ ...schoolResult, status: "unavailable", reason: "upstream_unavailable", matches: [] });
    const { res, result } = response();
    await handler(request(), res);
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ status: "unavailable", reason: "upstream_unavailable" });
  });
});

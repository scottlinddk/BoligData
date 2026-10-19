import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
const { getClient, requireUser, lookup } = vi.hoisted(() => ({ getClient: vi.fn(), requireUser: vi.fn(), lookup: vi.fn() }));
vi.mock("../../middleware/cors.js", () => ({ applyCors: () => false }));
vi.mock("../../middleware/auth.js", () => ({ requireUser, getOptionalUser: vi.fn() }));
vi.mock("../supabase.js", () => ({ getAnonClient: getClient }));
vi.mock("./source.js", () => ({ lookupMiljoegisNoise: lookup }));
import handler from "../../../api/properties.js";

const propertyId = "12345678-abcd-abcd-abcd-123456789012";
const req = (query: Record<string, unknown> = {}) => ({ method: "GET", query: { id: propertyId, resource: "miljoegis-noise", ...query }, headers: {} }) as unknown as VercelRequest;
function response() { const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res); return res; }
function database(data: unknown, error: unknown = null) {
  const builder = { select: vi.fn(), eq: vi.fn(), single: vi.fn().mockResolvedValue({ data, error }) };
  builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder);
  getClient.mockReturnValue({ from: vi.fn().mockReturnValue(builder) });
  return builder;
}

describe("authenticated MiljøGIS listing resource", () => {
  beforeEach(() => { vi.clearAllMocks(); requireUser.mockResolvedValue({ jwt: "user-jwt" }); });
  it("authenticates before accessing listing coordinates or MiljøGIS", async () => {
    requireUser.mockResolvedValue(null);
    await handler(req(), response() as unknown as VercelResponse);
    expect(getClient).not.toHaveBeenCalled(); expect(lookup).not.toHaveBeenCalled();
  });
  it.each([{ id: "bad" }, { source: "https://attacker.test" }, { source: ["urban_roads"] }, { metric: ["Lden"] }, { metric: "Lmax" }])("rejects invalid query %j without upstream access", async query => {
    database({ lat: 57, lon: 10 }); const res = response();
    await handler(req(query), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(400); expect(lookup).not.toHaveBeenCalled();
  });
  it("reads only the stored property through the signed-in client and prevents shared caching", async () => {
    const db = database({ lat: "57.03966723", lon: "9.86901381", data_mode: "live" });
    const result = { status: "unavailable", reason: "upstream_unavailable" }; lookup.mockResolvedValue(result);
    const res = response();
    await handler(req({ source: "railways", metric: "Lnight", lat: "55", lon: "12", datasource: "attacker" }), res as unknown as VercelResponse);
    expect(getClient).toHaveBeenCalledWith("user-jwt"); expect(db.eq).toHaveBeenCalledWith("id", propertyId);
    expect(lookup).toHaveBeenCalledWith({ lat: 57.03966723, lon: 9.86901381, dataMode: "live" }, expect.objectContaining({ layer: "ds_dk_2022_noise_jernbane_nat_1_5m", metric: "Lnight" }));
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store"); expect(res.json).toHaveBeenCalledWith(result);
  });
  it("returns 404 without external access for an inaccessible listing", async () => {
    database(null, { message: "missing" }); const res = response();
    await handler(req(), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(404); expect(lookup).not.toHaveBeenCalled();
  });
  it.each([{ lat: null, lon: null, data_mode: "live" }, { lat: 57, lon: 10, data_mode: "demo" }])("preserves absent coordinates and demo mode for source gating", async data => {
    database(data); lookup.mockResolvedValue({ status: "unavailable" });
    await handler(req(), response() as unknown as VercelResponse);
    expect(lookup).toHaveBeenCalledWith({ lat: data.lat, lon: data.lon, dataMode: data.data_mode }, expect.objectContaining({ source: "urban_roads", metric: "Lden" }));
  });
});

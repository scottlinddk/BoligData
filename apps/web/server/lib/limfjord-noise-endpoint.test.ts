import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const { getClient, requireUser, lookup } = vi.hoisted(() => ({ getClient: vi.fn(), requireUser: vi.fn(), lookup: vi.fn() }));
vi.mock("../middleware/cors.js", () => ({ applyCors: () => false }));
vi.mock("../middleware/auth.js", () => ({ requireUser, getOptionalUser: vi.fn() }));
vi.mock("./supabase.js", () => ({ getAnonClient: getClient }));
vi.mock("./enrichment-sources/limfjord-noise.js", () => ({ lookupLimfjordNoise: lookup }));
import handler from "../../api/properties.js";

const propertyId = "12345678-abcd-abcd-abcd-123456789012";
const req = (query: Record<string, unknown> = {}) => ({ method: "GET", query: { id: propertyId, resource: "limfjord-noise", ...query }, headers: {} }) as unknown as VercelRequest;
function response() {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe("listing noise resource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ jwt: "signed-in-jwt" });
  });

  it("requires authentication before reading a listing or external data", async () => {
    requireUser.mockResolvedValue(null);
    await handler(req(), response() as unknown as VercelResponse);
    expect(getClient).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each([{ id: "bad-id" }, { lang: ["da", "en"] }, { lang: "de" }])("rejects invalid query %j", async query => {
    const res = response();
    getClient.mockReturnValue({ from: vi.fn() });
    await handler(req(query), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("looks up only the authorized stored listing, returns isolated failure and forbids shared caching", async () => {
    const builder = { select: vi.fn(), eq: vi.fn(), single: vi.fn() };
    builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder);
    builder.single.mockResolvedValue({ data: { id: propertyId, address: "Slåenvej 18", postal_code: "9000", id_lokalid: null, lat: 57.03, lon: 9.9 }, error: null });
    const from = vi.fn().mockReturnValue(builder);
    getClient.mockReturnValue({ from });
    const unavailable = { status: "unavailable", reason: "upstream_unavailable", checkedAt: "2026-09-28T12:00:00Z" };
    lookup.mockResolvedValue(unavailable);
    const res = response();
    await handler(req({ lang: "en", address: "ignored attacker-supplied address" }), res as unknown as VercelResponse);
    expect(getClient).toHaveBeenCalledWith("signed-in-jwt");
    expect(from).toHaveBeenCalledTimes(1);
    expect(builder.eq).toHaveBeenCalledWith("id", propertyId);
    expect(lookup).toHaveBeenCalledWith(expect.objectContaining({ address: "Slåenvej 18" }), "en");
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(unavailable);
  });

  it("does not query the external API for an inaccessible listing", async () => {
    const builder = { select: vi.fn(), eq: vi.fn(), single: vi.fn() };
    builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder);
    builder.single.mockResolvedValue({ data: null, error: { message: "missing" } });
    getClient.mockReturnValue({ from: () => builder });
    const res = response();
    await handler(req(), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(lookup).not.toHaveBeenCalled();
  });
});

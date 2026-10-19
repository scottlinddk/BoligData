import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { serializeSearchBoundary } from "../../../../packages/shared/src/utils/search-boundary.js";

const { getClient } = vi.hoisted(() => ({ getClient: vi.fn() }));
vi.mock("../middleware/cors.js", () => ({ applyCors: () => false }));
vi.mock("../middleware/auth.js", () => ({
  getOptionalUser: async () => ({ userId: "test-user", jwt: "fake-jwt" }),
  requireUser: async () => ({ userId: "test-user", jwt: "fake-jwt" }),
}));
vi.mock("./supabase.js", () => ({ getAnonClient: getClient }));

import propertiesHandler from "../../api/properties.js";
import searchesHandler from "../../api/searches.js";

function response() {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
const request = (method: string, query: Record<string, unknown> = {}, body?: unknown) => ({ method, query, body, headers: {} }) as unknown as VercelRequest;
const boundary = "[[9,57],[10,57],[10,58],[9,58]]";

describe("drawn-boundary API validation", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it.each(["", "invalid", "[[9,57],[10,57]]", [boundary, boundary]])("rejects invalid or repeated query input before any database query (%j)", async polygon => {
    const client = { from: vi.fn(), rpc: vi.fn() };
    getClient.mockReturnValue(client);
    const res = response();
    await propertiesHandler(request("GET", { polygon }), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining("Invalid map boundary") });
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("converts a database boundary-validation failure to a safe 400 response", async () => {
    const builder = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() };
    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.order.mockReturnValue(builder);
    builder.range.mockResolvedValue({ data: null, count: null, error: { code: "22023", message: "internal geometry detail" } });
    getClient.mockReturnValue({ rpc: vi.fn().mockReturnValue(builder) });
    const res = response();
    await propertiesHandler(request("GET", { polygon: boundary }), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining("Invalid map boundary") });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("internal geometry detail");
  });

  it.each(["", "invalid", [[9, 57], [10, 57], [10, 58]]])("does not save invalid or non-string boundaries (%j)", async polygon => {
    const client = { from: vi.fn() };
    getClient.mockReturnValue(client);
    const res = response();
    await searchesHandler(request("POST", {}, { name: "Local area", filters: { polygon } }), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("stores a canonical boundary with the user's other filters and alert choice", async () => {
    const polygon = "[[10,58],[10,57],[9,57],[9,58],[10,58]]";
    const canonical = serializeSearchBoundary([[9, 57], [10, 57], [10, 58], [9, 58]]);
    let saved: Record<string, unknown> = {};
    const builder = { insert: vi.fn(), select: vi.fn(), single: vi.fn() };
    builder.insert.mockImplementation(value => { saved = value; return builder; });
    builder.select.mockReturnValue(builder);
    builder.single.mockImplementation(async () => ({ data: { id: "saved-id", ...saved }, error: null }));
    getClient.mockReturnValue({ from: vi.fn().mockReturnValue(builder) });
    const res = response();
    await searchesHandler(request("POST", {}, { name: "Local area", filters: { polygon, minPrice: 2_000_000 }, alertFrequency: "daily" }), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(saved).toEqual({ user_id: "test-user", name: "Local area", filters: { polygon: canonical, minPrice: 2_000_000 }, alert_frequency: "daily" });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ filters: { polygon: canonical, minPrice: 2_000_000 } }));
  });
});

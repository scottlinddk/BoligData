import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../../api/property-lookup.js";
import { requireUser } from "../../middleware/auth.js";
import { lookupProperty } from "./property-lookup.handler.js";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../middleware/auth.js", () => ({ requireUser: vi.fn() }));
vi.mock("../supabase.js", () => ({ getAnonClient: () => ({ rpc }) }));
vi.mock("./property-lookup.handler.js", () => ({ lookupProperty: vi.fn() }));

function response() {
  const result = { statusCode: 0, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader(name: string, value: string) { result.headers[name.toLowerCase()] = value; return res; },
    status(code: number) { result.statusCode = code; return res; },
    json(body: unknown) { result.body = body; return res; }, end() { return res; },
  };
  return { result, res: res as unknown as VercelResponse };
}
const query = { address: "Testvej 1, 9000 Aalborg", askingPrice: "2000000" };
function request(values: Record<string, string> = query): VercelRequest {
  return { method: "GET", query: values, headers: { authorization: "Bearer token" } } as unknown as VercelRequest;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ userId: "user-1", jwt: "token" });
  rpc.mockResolvedValue({ data: true, error: null });
  vi.mocked(lookupProperty).mockResolvedValue({ address: query.address, source: "ai" } as Awaited<ReturnType<typeof lookupProperty>>);
});

describe("authenticated register lookup", () => {
  it("rejects unauthenticated callers before spending upstream or quota requests", async () => {
    vi.mocked(requireUser).mockImplementation(async (_req, res) => { res.status(401).json({ error: "Missing bearer token" }); return null; });
    const { res, result } = response();
    await handler(request(), res);
    expect(result.statusCode).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(lookupProperty).not.toHaveBeenCalled();
  });

  it("consumes the persistent account quota and never publicly caches private inputs", async () => {
    const { res, result } = response();
    await handler(request(), res);
    expect(result.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith("consume_register_lookup_budget");
    expect(result.headers["cache-control"]).toBe("private, no-store");
    expect(lookupProperty).toHaveBeenCalledOnce();
  });

  it("rejects an exhausted quota without making register calls", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const { res, result } = response();
    await handler(request(), res);
    expect(result.statusCode).toBe(429);
    expect(result.headers["retry-after"]).toBe("3600");
    expect(lookupProperty).not.toHaveBeenCalled();
  });

  it("fails closed when the quota database is unavailable", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    const { res, result } = response();
    await handler(request(), res);
    expect(result.statusCode).toBe(503);
    expect(lookupProperty).not.toHaveBeenCalled();
  });

  it.each([
    { address: query.address }, { ...query, askingPrice: "-1" },
    { ...query, address: "x".repeat(301) }, { ...query, lat: "57" },
    { ...query, lat: "0", lon: "10" },
  ])("rejects malformed lookup input before quota consumption", async (values) => {
    const { res, result } = response();
    await handler(request(values), res);
    expect(result.statusCode).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(lookupProperty).not.toHaveBeenCalled();
  });

  it("rejects non-GET methods", async () => {
    const { res, result } = response();
    await handler({ ...request(), method: "POST" } as VercelRequest, res);
    expect(result.statusCode).toBe(405);
  });
});

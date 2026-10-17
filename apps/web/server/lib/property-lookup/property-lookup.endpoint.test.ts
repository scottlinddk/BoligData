import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../../api/property-lookup.js";
import { requireUser } from "../../middleware/auth.js";
import { lookupProperty } from "./property-lookup.handler.js";
import { estimateAddressSpar } from "./address-spar.js";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../middleware/auth.js", () => ({ requireUser: vi.fn() }));
vi.mock("../supabase.js", () => ({ getAnonClient: () => ({ rpc }) }));
vi.mock("./property-lookup.handler.js", () => ({ lookupProperty: vi.fn() }));
vi.mock("./address-spar.js", () => ({ estimateAddressSpar: vi.fn() }));

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
    { ...query, askingPrice: "-1" },
    { ...query, address: "x".repeat(301) }, { ...query, lat: "57" },
    { ...query, lat: "0", lon: "10" },
  ])("rejects malformed lookup input before quota consumption", async (values) => {
    const { res, result } = response();
    await handler(request(values), res);
    expect(result.statusCode).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(lookupProperty).not.toHaveBeenCalled();
  });

  it("looks up a husnummer id with no asking price and no free-text address", async () => {
    const id = "0a3f509c-38ed-32b8-e044-0003ba298018";
    const { res, result } = response();
    await handler(request({ husnummerId: id }), res);
    expect(result.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith("consume_register_lookup_budget");
    expect(lookupProperty).toHaveBeenCalledWith(expect.objectContaining({ husnummerId: id, address: "", askingPrice: null }));
  });

  it("adds the fair-price estimate to a husnummer lookup", async () => {
    const estimate = { status: "available", method: "own-spar-local-level/1" } as Awaited<ReturnType<typeof estimateAddressSpar>>;
    vi.mocked(estimateAddressSpar).mockResolvedValue(estimate);
    const { res, result } = response();
    await handler(request({ husnummerId: "0a3f509c-38ed-32b8-e044-0003ba298018" }), res);
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ source: "ai", spar: estimate });
    expect(estimateAddressSpar).toHaveBeenCalledOnce();
  });

  it("still answers the lookup, with spar null, when the market data cannot be read", async () => {
    vi.mocked(estimateAddressSpar).mockRejectedValue(new Error("database unavailable"));
    const { res, result } = response();
    await handler(request({ husnummerId: "0a3f509c-38ed-32b8-e044-0003ba298018" }), res);
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ source: "ai", spar: null });
  });

  it("does not estimate, or add a spar field, for a free-text listing lookup", async () => {
    const { res, result } = response();
    await handler(request(), res);
    expect(result.statusCode).toBe(200);
    expect(estimateAddressSpar).not.toHaveBeenCalled();
    expect(result.body).not.toHaveProperty("spar");
  });

  it("still passes a listing's asking price through", async () => {
    const { res } = response();
    await handler(request(), res);
    expect(lookupProperty).toHaveBeenCalledWith(expect.objectContaining({ askingPrice: 2_000_000, husnummerId: null }));
  });

  it.each<Record<string, string>>([
    { husnummerId: "not-a-uuid" },
    { husnummerId: "0a3f509c-38ed-32b8-e044-0003ba298018/../x" },
    { address: query.address, askingPrice: "abc" },
    { address: query.address, askingPrice: "0" },
    { husnummerId: "0a3f509c-38ed-32b8-e044-0003ba298018", askingPrice: "-5" },
    {},
  ])("rejects an unusable identifier or a malformed price before quota consumption", async (values) => {
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

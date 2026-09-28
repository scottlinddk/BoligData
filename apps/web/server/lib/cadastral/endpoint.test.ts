import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../../api/properties.js";
import { requireUser } from "../../middleware/auth.js";
import { getCadastralReport } from "./source.js";
const { single, rpc, from } = vi.hoisted(() => ({ single: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("../../middleware/auth.js", () => ({ requireUser: vi.fn(), getOptionalUser: vi.fn() }));
vi.mock("../supabase.js", () => ({ getAnonClient: () => ({ from, rpc }) }));
vi.mock("./source.js", () => ({ getCadastralReport: vi.fn() }));
const id = "0a3f509c-b58c-32b8-e044-0003ba298018";
function response() {
  const result = { code: 0, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = { status(n: number) { result.code = n; return res; }, json(v: unknown) { result.body = v; return res; }, setHeader(k: string, v: string) { result.headers[k.toLowerCase()] = v; return res; }, end() {} } as unknown as VercelResponse;
  return { res, result };
}
const request = (query = { id, resource: "cadastral" }) => ({ method: "GET", query, headers: {} }) as unknown as VercelRequest;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ userId: "test-user", jwt: "test-token" });
  from.mockReturnValue({ select: () => ({ eq: () => ({ single }) }) });
  single.mockResolvedValue({ data: { id, address: "Stored address", bfe_nummer: "3299386" }, error: null });
  rpc.mockResolvedValue({ data: true, error: null });
  vi.mocked(getCadastralReport).mockResolvedValue({ status: "available" } as Awaited<ReturnType<typeof getCadastralReport>>);
});
describe("cadastral authenticated resource", () => {
  it("rejects unauthenticated calls before database or source access", async () => {
    vi.mocked(requireUser).mockImplementation(async (_req, res) => { res.status(401).json({ error: "unauthorized" }); return null; });
    const { res, result } = response(); await handler(request(), res);
    expect(result.code).toBe(401); expect(from).not.toHaveBeenCalled(); expect(getCadastralReport).not.toHaveBeenCalled();
  });
  it("looks up only the stored property with private caching and persistent account quota", async () => {
    const { res, result } = response(); await handler(request(), res);
    expect(result.code).toBe(200); expect(result.headers["cache-control"]).toBe("private, no-store");
    expect(rpc).toHaveBeenCalledWith("consume_register_lookup_budget");
    expect(getCadastralReport).toHaveBeenCalledWith(expect.objectContaining({ address: "Stored address", bfeNummer: "3299386" }));
  });
  it("does not accept arbitrary invalid property identifiers", async () => {
    const { res, result } = response(); await handler(request({ id: "other", resource: "cadastral" }), res);
    expect(result.code).toBe(400); expect(from).not.toHaveBeenCalled();
  });
  it("returns 404 before spending quota for missing/inaccessible properties", async () => {
    single.mockResolvedValue({ data: null, error: {} });
    const { res, result } = response(); await handler(request(), res);
    expect(result.code).toBe(404); expect(rpc).not.toHaveBeenCalled();
  });
  it.each([{ data: false, error: null, code: 429 }, { data: null, error: {}, code: 503 }])("fails closed for unavailable/exhausted quota", async value => {
    rpc.mockResolvedValue(value); const { res, result } = response(); await handler(request(), res);
    expect(result.code).toBe(value.code); expect(getCadastralReport).not.toHaveBeenCalled();
  });
});

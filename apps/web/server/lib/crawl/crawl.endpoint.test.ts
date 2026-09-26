import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const { getClient, ingest, verify, logError, cors } = vi.hoisted(() => ({ getClient: vi.fn(), ingest: vi.fn(), verify: vi.fn(), logError: vi.fn(), cors: vi.fn() }));
vi.mock("../../middleware/cors.js", () => ({ applyCors: cors }));
vi.mock("../supabase.js", () => ({ getServiceRoleClient: getClient }));
vi.mock("./ingest.js", () => ({ runIngest: ingest }));
vi.mock("./runner-verification.js", () => ({ verifyCrawlData: verify }));
vi.mock("./log.js", () => ({ logError }));
import handler from "../../../api/crawl.js";

const CLIENT = { from: "database fixture" };
const SECRET = "endpoint-test-only-secret";
async function call(body?: unknown, authorization: unknown = `Bearer ${SECRET}`, method = "POST") {
  const response = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  response.status.mockReturnValue(response);
  await handler({ method, headers: { authorization }, body } as unknown as VercelRequest, response as unknown as VercelResponse);
  return response;
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", SECRET);
  cors.mockReturnValue(false); getClient.mockReturnValue(CLIENT);
  ingest.mockResolvedValue({ ok: true, reports: [] });
  verify.mockResolvedValue({ counts: { realProperties: 10 }, targetFound: true, samples: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe("authenticated crawl API", () => {
  it.each([null, "", "Bearer wrong", "Basic wrong", SECRET, [`Bearer ${SECRET}`]])("rejects unauthenticated or invalid authorization %j before database connection", async authorization => {
    const res = await call({ mode: "verify" }, authorization);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(getClient).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled(); expect(ingest).not.toHaveBeenCalled();
  });

  it("rejects a missing configured secret and unsupported methods", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call()).status).toHaveBeenCalledWith(401);
    expect((await call(undefined, `Bearer ${SECRET}`, "GET")).status).toHaveBeenCalledWith(405);
    expect(getClient).not.toHaveBeenCalled();
  });

  it("runs verification only and disables response caching", async () => {
    const res = await call({ mode: "verify" }, `bearer ${SECRET}`);
    expect(verify).toHaveBeenCalledExactlyOnceWith(CLIENT);
    expect(ingest).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true, counts: { realProperties: 10 }, targetFound: true, samples: [] });
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  });

  it.each([undefined, null, "", {}])("preserves a full ingest for an empty body %j", async body => {
    const res = await call(body);
    expect(ingest).toHaveBeenCalledExactlyOnceWith(CLIENT);
    expect(verify).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it.each([{ offset: 0, batchSize: 1 }, { offset: 8, batchSize: 8 }, { offset: 50_000, batchSize: 50 }])("forwards exactly the validated batch %j", async body => {
    const result = { ok: true, reports: [], batch: { ...body, total: 600, nextOffset: body.offset + body.batchSize } };
    ingest.mockResolvedValue(result);
    const res = await call(body);
    expect(ingest).toHaveBeenCalledExactlyOnceWith(CLIENT, body);
    expect(verify).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it.each([
    [], true, 8, "not json", '{"mode":"verify"}',
    { mode: "unknown" }, { mode: "ingest" }, { mode: "verify", offset: 0, batchSize: 8 }, { mode: "verify", extra: true },
    { offset: 0 }, { batchSize: 8 }, { offset: 0, batchSize: 8, extra: true },
    { offset: -1, batchSize: 8 }, { offset: 50_001, batchSize: 8 }, { offset: 0.5, batchSize: 8 }, { offset: "0", batchSize: 8 },
    { offset: Number.NaN, batchSize: 8 }, { offset: Number.POSITIVE_INFINITY, batchSize: 8 },
    { offset: 0, batchSize: 0 }, { offset: 0, batchSize: 51 }, { offset: 0, batchSize: 1.5 }, { offset: 0, batchSize: "8" },
    { offset: 0, batchSize: null }, { offset: 0, batchSize: Number.NaN },
  ])("rejects invalid or mismatched fields before connecting (%j)", async body => {
    const res = await call(body);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(getClient).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled(); expect(ingest).not.toHaveBeenCalled();
  });

  it("preserves source failure reports and the existing 502 status", async () => {
    const result = { ok: false, reports: [{ source: "boligsiden", ok: false, errors: ["Source unavailable"] }] };
    ingest.mockResolvedValue(result);
    const res = await call({ offset: 0, batchSize: 8 });
    expect(res.status).toHaveBeenCalledWith(502); expect(res.json).toHaveBeenCalledWith(result);
  });

  it.each(["ingest", "verify", "connection"])("never exposes a raw %s failure or credentials in the response", async failing => {
    const detail = new Error(`private database details / ${SECRET}`);
    if (failing === "connection") getClient.mockImplementation(() => { throw detail; });
    else (failing === "verify" ? verify : ingest).mockRejectedValue(detail);
    const res = await call(failing === "verify" ? { mode: "verify" } : { offset: 0, batchSize: 8 });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: failing === "verify" ? "Crawl verification failed" : "Crawl failed" });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(SECRET);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("private database");
    expect(logError).toHaveBeenCalledOnce();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../../api/admin.js";
import { requireRole } from "../../middleware/auth.js";

vi.mock("../../middleware/auth.js", () => ({ requireRole: vi.fn() }));
vi.mock("../supabase.js", () => ({ getServiceRoleClient: () => ({}), getAuthAdmin: vi.fn() }));
vi.mock("../../middleware/cors.js", () => ({ applyCors: () => false }));

function response() {
  const result = { statusCode: 0, body: undefined as unknown };
  const res = {
    setHeader() { return res; },
    status(code: number) { result.statusCode = code; return res; },
    json(body: unknown) { result.body = body; return res; },
  };
  return { result, res: res as unknown as VercelResponse };
}
function request(method: string): VercelRequest {
  return { method, query: { resource: "new-listings" }, headers: {} } as unknown as VercelRequest;
}
const run = (status: string, id = 1) => ({
  id, run_number: id, status, conclusion: status === "completed" ? "success" : null,
  event: "schedule", created_at: "2026-10-17T10:00:00Z", html_url: `https://github.com/r/${id}`,
});

const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GITHUB_DISPATCH_TOKEN", "ghp_test");
  vi.mocked(requireRole).mockResolvedValue({ userId: "admin-1", jwt: "t" } as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("admin new-listings resource", () => {
  it("lists recent runs with mapped fields", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ workflow_runs: [run("completed")] })));
    const { res, result } = response();
    await handler(request("GET"), res);
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({
      runs: [{ id: 1, runNumber: 1, status: "completed", conclusion: "success", trigger: "scheduled",
        createdAt: "2026-10-17T10:00:00Z", url: "https://github.com/r/1" }],
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/actions/workflows/new-listings.yml/runs");
  });

  it("dispatches the workflow on main when nothing is running", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_runs: [run("completed")] })))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { res, result } = response();
    await handler(request("POST"), res);
    expect(result.statusCode).toBe(202);
    const [url, init] = fetchMock.mock.calls[1] as [string, { body: string; headers: Record<string, string> }];
    expect(url).toContain("/new-listings.yml/dispatches");
    expect(JSON.parse(init.body)).toEqual({ ref: "main" });
    expect(init.headers.Authorization).toBe("Bearer ghp_test");
  });

  it("refuses to dispatch while a run is queued or in progress", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ workflow_runs: [run("in_progress")] })));
    const { res, result } = response();
    await handler(request("POST"), res);
    expect(result.statusCode).toBe(409);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("answers 503 without a token and never calls GitHub", async () => {
    vi.stubEnv("GITHUB_DISPATCH_TOKEN", "");
    const { res, result } = response();
    await handler(request("POST"), res);
    expect(result.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a GitHub rejection to 502 without leaking its body", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_runs: [] })))
      .mockResolvedValueOnce(new Response("secret detail", { status: 403 }));
    const { res, result } = response();
    await handler(request("POST"), res);
    expect(result.statusCode).toBe(502);
    expect(JSON.stringify(result.body)).not.toContain("secret");
  });

  it("does not touch GitHub for non-admins", async () => {
    vi.mocked(requireRole).mockResolvedValue(null);
    const { res } = response();
    await handler(request("POST"), res);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

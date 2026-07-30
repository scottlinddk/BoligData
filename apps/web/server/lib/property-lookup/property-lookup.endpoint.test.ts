import { describe, expect, it } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
// Lives here rather than next to the handler in api/, because Vercel turns
// every file it uploads under api/ into a Serverless Function — including
// *.test.ts — and the Hobby plan caps a deployment at 12. See .vercelignore.
import handler from "../../../api/property-lookup.js";

interface Captured {
  statusCode: number | null;
  body: unknown;
  headers: Record<string, string>;
  res: VercelResponse;
}

function mockRes(): Captured {
  const captured: Captured = { statusCode: null, body: undefined, headers: {}, res: null as never };
  const res = {
    setHeader(name: string, value: string) {
      captured.headers[name.toLowerCase()] = value;
      return res;
    },
    status(code: number) {
      captured.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
    end() {
      return res;
    },
  };
  captured.res = res as unknown as VercelResponse;
  return captured;
}

function mockReq(query: Record<string, string>, headers: Record<string, string> = {}): VercelRequest {
  return { method: "GET", query, headers } as unknown as VercelRequest;
}

const query = { address: "Skomagergyden 4, 9000 Aalborg", askingPrice: "2000000" };

describe("GET /api/property-lookup (mock mode)", () => {
  it("answers without an Authorization header", async () => {
    const captured = mockRes();
    await handler(mockReq(query), captured.res);

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toMatchObject({ address: query.address, source: "ai" });
  });

  it("sends a public, CDN-cacheable response rather than private/no-store", async () => {
    const captured = mockRes();
    await handler(mockReq(query), captured.res);

    expect(captured.headers["cache-control"]).toBe("public, s-maxage=300, stale-while-revalidate=3600");
  });

  it("returns the same payload with or without a bearer token", async () => {
    const anonymous = mockRes();
    const withToken = mockRes();
    await handler(mockReq(query), anonymous.res);
    await handler(mockReq(query, { authorization: "Bearer not-a-real-jwt" }), withToken.res);

    expect(anonymous.body).toEqual(withToken.body);
  });

  it("still 400s on a missing required query param", async () => {
    const captured = mockRes();
    await handler(mockReq({ address: query.address }), captured.res);

    expect(captured.statusCode).toBe(400);
    expect(captured.body).toEqual({
      error: "address and askingPrice query parameters are required",
    });
  });

  it("still 405s on a non-GET method", async () => {
    const captured = mockRes();
    const req = { ...mockReq(query), method: "POST" } as VercelRequest;
    await handler(req, captured.res);

    expect(captured.statusCode).toBe(405);
  });
});

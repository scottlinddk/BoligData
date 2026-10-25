import { afterEach, describe, expect, it, vi } from "vitest";
import { etrs89Utm32ToWgs84, wgs84ToEtrs89Utm32 } from "../geo/etrs89-utm32.js";
import { MAX_BBOX_SPAN_DEG, parseParcelBbox } from "./bbox.js";
import { getParcelsInView, mockParcels, parcelsQuery } from "./source.js";
import { handleParcelOwner } from "./handler.js";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const BBOX = "9.8759,57.0295,9.8769,57.03";

describe("parseParcelBbox", () => {
  it("accepts a street-level box in Denmark", () => expect(parseParcelBbox(BBOX)).toEqual({ minLon: 9.8759, minLat: 57.0295, maxLon: 9.8769, maxLat: 57.03 }));
  it.each([undefined, "", "1,2,3", "a,b,c,d", "9.9,57.1,9.8,57.0", "0,0,1,1", `9.8,57.0,9.8${"9"},${57 + MAX_BBOX_SPAN_DEG * 3}`, "9.8,57.0,9.9,57.001"])("rejects %s", value => {
    // The last case is wider than twice the span cap.
    expect(parseParcelBbox(value)).toBeNull();
  });
});

describe("projection round trip", () => {
  it("forward then inverse returns the input within a millimetre", () => {
    const utm = wgs84ToEtrs89Utm32(57.0295, 9.8759)!;
    const back = etrs89Utm32ToWgs84(utm.easting, utm.northing)!;
    expect(back.lat).toBeCloseTo(57.0295, 8); expect(back.lon).toBeCloseTo(9.8759, 8);
    expect(utm.easting).toBeGreaterThan(550_000); expect(utm.northing).toBeGreaterThan(6_300_000);
  });
});

describe("parcel source", () => {
  it("serves fictitious parcels without a BFE in mock mode (the default)", async () => {
    const result = await getParcelsInView(parseParcelBbox(BBOX)!);
    expect(result.source).toBe("mock");
    expect(result.parcels.every(p => p.bfeNumber === null)).toBe(true);
    expect(mockParcels(parseParcelBbox(BBOX)!).parcels).toHaveLength(2);
  });
  it("fails closed without a key, and builds a UTM box when it has one", async () => {
    vi.stubEnv("PARCEL_MAP_MOCK_MODE", "false"); vi.stubEnv("DATAFORDELER_API_KEY", "");
    expect((await getParcelsInView(parseParcelBbox(BBOX)!)).status).toBe("unavailable");
    expect(parcelsQuery(parseParcelBbox(BBOX)!, "2026-10-25T00:00:00.000Z")).toMatch(/minX: 5\d{5}\.\d, minY: 63\d{5}\.\d/);
  });
  it("returns unavailable on a GraphQL error instead of partial data", async () => {
    vi.stubEnv("PARCEL_MAP_MOCK_MODE", "false"); vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: "bad filter" }] }), { status: 200 })));
    expect((await getParcelsInView(parseParcelBbox(BBOX)!)).status).toBe("unavailable");
  });
});

describe("owner endpoint", () => {
  const res = () => { const r = { headers: {} as Record<string, string>, code: 0, body: undefined as unknown, setHeader(k: string, v: string) { r.headers[k] = v; }, status(c: number) { r.code = c; return r; }, json(b: unknown) { r.body = b; return r; } }; return r; };
  it("rejects a malformed BFE before spending quota", async () => {
    const rpc = vi.fn(); const r = res();
    await handleParcelOwner({ rpc } as never, "12;drop", r as never);
    expect(r.code).toBe(400); expect(rpc).not.toHaveBeenCalled();
  });
  it("never queries registers in mock mode", async () => {
    const rpc = vi.fn(); const r = res();
    await handleParcelOwner({ rpc } as never, "3299123", r as never);
    expect(r.code).toBe(200); expect(rpc).not.toHaveBeenCalled(); expect((r.body as { owners: unknown[] }).owners).toEqual([]);
  });
  it("answers 429 with Retry-After when the hourly budget is spent", async () => {
    vi.stubEnv("PARCEL_MAP_MOCK_MODE", "false"); const r = res();
    await handleParcelOwner({ rpc: vi.fn(async () => ({ data: false, error: null })) } as never, "3299123", r as never);
    expect(r.code).toBe(429); expect(r.headers["Retry-After"]).toBe("3600");
  });
});

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
    expect(parcelsQuery(parseParcelBbox(BBOX)!, "2026-10-25T00:00:00.000Z")).toMatch(/MAT_Lodflade\(.*intersects: \{crs: 25832, wkt: "POLYGON\(\(5\d{5}\.\d 63\d{5}\.\d,/s);
    expect(parcelsQuery(parseParcelBbox(BBOX)!, "2026-10-25T00:00:00.000Z")).not.toContain("geometriIBoundingBox");
  });
  it("joins lodflade, jordstykke, ejerlav and estate into one parcel", async () => {
    vi.stubEnv("PARCEL_MAP_MOCK_MODE", "false"); vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    const ring = "POLYGON((550000 6300000, 550010 6300000, 550010 6300010, 550000 6300010, 550000 6300000))";
    const reply = (body: string) => {
      if (body.includes("MAT_Lodflade")) return { MAT_Lodflade: { nodes: [{ jordstykkeLokalId: "111", geometri: { wkt: ring, crs: 25832 } }] } };
      if (body.includes("MAT_Jordstykke")) return { MAT_Jordstykke: { nodes: [{ id_lokalId: "111", matrikelnummer: "12a", ejerlavLokalId: "222", samletFastEjendomLokalId: "333" }] } };
      if (body.includes("MAT_SamletFastEjendom")) return { MAT_SamletFastEjendom: { nodes: [{ id_lokalId: "333", BFEnummer: 3299123 }] } };
      return { MAT_Ejerlav: { nodes: [{ id_lokalId: "222", ejerlavsnavn: "Test By" }] } };
    };
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => new Response(JSON.stringify({ data: reply(JSON.parse(init.body).query) }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getParcelsInView(parseParcelBbox(BBOX)!);
    expect(result.status).toBe("available");
    expect(result.parcels).toMatchObject([{ id: "111", bfeNumber: "3299123", number: "12a", district: "Test By" }]);
    // Datafordeler rejects aliases ("b0: ...") and multiple root fields, so every request must be a single plain root.
    for (const [, init] of fetchMock.mock.calls) expect(JSON.parse(init.body).query).not.toMatch(/\bb\d+\s*:/);
  });
  it("sends one single-root request per 100-id batch", async () => {
    vi.stubEnv("PARCEL_MAP_MOCK_MODE", "false"); vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    const ring = "POLYGON((550000 6300000, 550010 6300000, 550010 6300010, 550000 6300010, 550000 6300000))";
    const nodes = Array.from({ length: 150 }, (_, i) => ({ jordstykkeLokalId: String(i + 1), geometri: { wkt: ring, crs: 25832 } }));
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const query: string = JSON.parse(init.body).query;
      if (query.includes("MAT_Lodflade")) return new Response(JSON.stringify({ data: { MAT_Lodflade: { nodes } } }), { status: 200 });
      const ids = [...query.matchAll(/"(\d+)"/g)].map(m => m[1]!);
      return new Response(JSON.stringify({ data: { MAT_Jordstykke: { nodes: ids.map(i => ({ id_lokalId: i, matrikelnummer: `m${i}`, ejerlavLokalId: null, samletFastEjendomLokalId: null })) } } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await getParcelsInView(parseParcelBbox(BBOX)!);
    expect(result.status).toBe("available");
    expect(result.parcels).toHaveLength(150);
    const jordstykke = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).query as string).filter(q => q.includes("MAT_Jordstykke"));
    expect(jordstykke).toHaveLength(2);
    for (const q of jordstykke) expect(q).not.toMatch(/\bb\d+\s*:/);
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
  const gate = async (estate: Record<string, unknown>) => {
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(String(url).includes("graphql")
      ? { data: { MAT_SamletFastEjendom: { nodes: [{ BFEnummer: 3299123, ...estate }] } } }
      : { ejere: [{ navn: "Test Owner", type: "Person" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { getParcelOwners } = await import("../cadastral/source.js");
    return { result: await getParcelOwners("3299123"), fetchMock };
  };
  it("returns owners only when the estate is explicitly not a condominium parent or common lot", async () => {
    const ok = await gate({ hovedejendomOpdeltIEjerlejligh: false, erFaelleslod: false });
    expect(ok.result.items).toHaveLength(1);
  });
  it("caches definitive owner answers for a day, but never an inconclusive one", async () => {
    vi.stubEnv("PARCEL_MAP_MOCK_MODE", "false");
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    await gate({ hovedejendomOpdeltIEjerlejligh: false, erFaelleslod: false });
    const ok = res(); await handleParcelOwner({ rpc } as never, "3299123", ok as never);
    expect(ok.headers["Cache-Control"]).toBe("private, max-age=86400");
    await gate({ hovedejendomOpdeltIEjerlejligh: false });
    const unknown = res(); await handleParcelOwner({ rpc } as never, "3299123", unknown as never);
    expect(unknown.headers["Cache-Control"]).toBe("private, no-store");
  });
  it.each([
    [{ hovedejendomOpdeltIEjerlejligh: true, erFaelleslod: false }, "condominium_parent"],
    [{ hovedejendomOpdeltIEjerlejligh: false, erFaelleslod: true }, "common_lot"],
    [{ hovedejendomOpdeltIEjerlejligh: false }, "source_unavailable"],
  ])("withholds owners and never calls BfeEjer for %j", async (estate, reason) => {
    const { result, fetchMock } = await gate(estate);
    expect(result.items).toEqual([]); expect(result.reason).toBe(reason);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("BfeEjer"))).toBe(true);
  });
});

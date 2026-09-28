import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOISE_LAYERS } from "./layers";
import { pointInNoiseGeometry, toUtm32, type Point } from "./geometry";
import { buildNoiseQuery, parseNoiseLayer } from "./source";

const point: Point = [555_000, 6_320_000];
const square = "POLYGON ((554990 6319990,555010 6319990,555010 6320010,554990 6320010,554990 6319990))";
const row = (lower = 53, upper = 58) => ({ isov1: lower, isov2: upper, shape_wkt: square });
const layer = NOISE_LAYERS[0]!;

describe("official MiljøGIS point geometry and model bands", () => {
  it("matches independently retrieved DAWA UTM coordinates to a centimetre", () => {
    const [x, y] = toUtm32(57.03966723, 9.86901381);
    expect(Math.abs(x - 552733.74)).toBeLessThan(0.02);
    expect(Math.abs(y - 6322137.06)).toBeLessThan(0.02);
  });
  it("uses one exact point, an explicit row cap and a fixed native datasource", () => {
    const url = buildNoiseQuery(layer, point);
    expect(url.origin).toBe("https://miljoegis.mim.dk");
    expect(url.searchParams.get("wkt")).toBe("POINT(555000.000 6320000.000)");
    expect(url.searchParams.get("maxrow")).toBe("20");
    expect(url.searchParams.get("filterWithWkt")).toBe("true");
    expect(url.searchParams.get("datasource")).toBe("ds_dk_2022_noise_vej_1_5m");
  });
  it("preserves the real 2022 native source fixture and verifies its polygon", () => {
    const raw = JSON.parse(readFileSync(new URL("./fixtures/urban-road-2022.json", import.meta.url), "utf8"));
    expect(parseNoiseLayer(raw, layer, point)).toMatchObject({ status: "band_found", bands: [{ lowerDb: 53, upperDb: 58 }] });
  });
  it("rejects bbox-only matches, respects holes and marks the one-metre boundary tolerance", () => {
    expect(pointInNoiseGeometry(point, square)).toBe("inside");
    expect(pointInNoiseGeometry([555020, 6320000], square)).toBe("outside");
    expect(pointInNoiseGeometry([555009.5, 6320000], square)).toBe("boundary");
    const hole = square.replace("))", "),(554995 6319995,555005 6319995,555005 6320005,554995 6320005,554995 6319995))");
    expect(pointInNoiseGeometry(point, hole)).toBe("outside");
    expect(pointInNoiseGeometry([555005, 6320000], hole)).toBe("boundary");
    expect(pointInNoiseGeometry(point, "POLYGON ((554990 6319990,555010 6319990,554990 6320010,554990 6319990))")).toBe("boundary");
    expect(pointInNoiseGeometry([555008, 6320008], "POLYGON ((554990 6319990,555010 6319990,554990 6320010,554990 6319990))")).toBe("outside");
    expect(pointInNoiseGeometry(point, `MULTIPOLYGON (${square.slice(8)})`)).toBe("inside");
    expect(pointInNoiseGeometry(point, "POINT(555000 6320000)")).toBe("invalid");
  });
  it("validates day/night/rail intervals against the distinct published legends", () => {
    expect(NOISE_LAYERS).toHaveLength(12);
    for (const selected of NOISE_LAYERS) {
      expect(parseNoiseLayer([row(selected.lowestBand, selected.lowestBand + 5)], selected, point).status).toBe("band_found");
      expect(parseNoiseLayer([row(52, 57)], selected, point).status).toBe("unavailable");
      expect(parseNoiseLayer([row(73, 73)], selected, point).status).toBe("unavailable");
    }
  });
  it("keeps no contour, overlap, boundary, malformed data and truncation distinct", () => {
    expect(parseNoiseLayer([], layer, point).status).toBe("no_contour");
    expect(parseNoiseLayer([row(), row()], layer, point).bands).toHaveLength(1);
    expect(parseNoiseLayer([row(), row(58, 63)], layer, point).status).toBe("overlapping_bands");
    expect(parseNoiseLayer([row()], layer, [555010, 6320000]).status).toBe("boundary");
    expect(parseNoiseLayer([{ isov1: 53, isov2: 58 }], layer, point).reason).toBe("invalid_response");
    expect(parseNoiseLayer({ features: [] }, layer, point).reason).toBe("invalid_response");
    expect(parseNoiseLayer(Array(20).fill(row()), layer, point).reason).toBe("response_limit");
    expect(parseNoiseLayer([{ ...row(), shape_wkt: "x".repeat(500001) }], layer, point).reason).toBe("response_limit");
  });
});

describe("bounded and isolated MiljøGIS lookup", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  const input = { lat: 57.03966723, lon: 9.86901381 };

  it("does not query for absent coordinates, non-Danish coordinates or demo data", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const { lookupMiljoegisNoise } = await import("./source");
    for (const data of [{ lat: null, lon: null }, { lat: NaN, lon: 9 }, { lat: 51, lon: 9 }, { ...input, dataMode: "demo" }, { ...input, dataMode: "mock" }]) {
      expect((await lookupMiljoegisNoise(data, layer)).status).toBe("unavailable");
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("caches and deduplicates only the same point/source/metric, without treating no-hit as zero", async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response("[]")); vi.stubGlobal("fetch", fetch);
    const { lookupMiljoegisNoise } = await import("./source");
    const [a, b] = await Promise.all([lookupMiljoegisNoise(input, layer), lookupMiljoegisNoise(input, layer)]);
    expect(a).toEqual(b); expect(a.layers[0]?.status).toBe("no_contour"); expect(a.layers[0]?.bands).toEqual([]);
    await lookupMiljoegisNoise(input, layer); expect(fetch).toHaveBeenCalledTimes(1);
    await lookupMiljoegisNoise(input, NOISE_LAYERS[1]!);
    await lookupMiljoegisNoise({ ...input, lon: 9.87 }, layer); expect(fetch).toHaveBeenCalledTimes(3);
    expect(a.mapUrl).toContain("profile=noise"); expect(a.mapUrl).toContain("mapext=");
  });
  it.each([() => new Response("down", { status: 503 }), () => new Response("not json"), () => { throw new Error("network"); }])("returns an isolated unknown for failed response %#", async reply => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(reply));
    const { lookupMiljoegisNoise } = await import("./source");
    const result = await lookupMiljoegisNoise(input, layer);
    expect(result.status).toBe("unavailable"); expect(result.layers[0]?.bands).toEqual([]);
  });
  it("bounds declared and streamed response sizes", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("[]", { headers: { "content-length": "5000000" } }))
      .mockResolvedValueOnce(new Response("x".repeat(4 * 1024 * 1024 + 1)));
    vi.stubGlobal("fetch", fetch);
    const { lookupMiljoegisNoise } = await import("./source");
    expect((await lookupMiljoegisNoise(input, layer)).layers[0]?.reason).toBe("response_limit");
    expect((await lookupMiljoegisNoise(input, NOISE_LAYERS[1]!)).layers[0]?.reason).toBe("response_limit");
  });
  it("aborts a slow source without converting it to an empty contour", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => { const controller = new AbortController(); setTimeout(() => controller.abort(), ms); return controller.signal; });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("timeout"))))));
    const { lookupMiljoegisNoise } = await import("./source");
    const result = lookupMiljoegisNoise(input, layer);
    await vi.advanceTimersByTimeAsync(40000);
    expect((await result).layers[0]?.status).toBe("unavailable");
    vi.restoreAllMocks();
  });
});

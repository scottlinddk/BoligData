import { afterEach, describe, expect, it, vi } from "vitest";
import type { GeoJSONSourceSpecification, StyleSpecification } from "maplibre-gl";
import { fetchMapStyle, mapStyleUrl, preserveMapOverlays } from "./map-theme";

afterEach(() => vi.unstubAllGlobals());

describe("map theme changes", () => {
  it("uses the existing provider's real light and dark styles", () => {
    expect(mapStyleUrl("light")).toBe("https://tiles.openfreemap.org/styles/liberty");
    expect(mapStyleUrl("dark")).toBe("https://tiles.openfreemap.org/styles/dark");
  });

  it("replaces the basemap but retains current boundary, draft and clustered listing data", () => {
    const boundary: GeoJSONSourceSpecification = { type: "geojson", data: { type: "FeatureCollection", features: [{ type: "Feature", properties: { kind: "draft-line" }, geometry: { type: "LineString", coordinates: [[9, 55], [10, 56]] } }] } };
    const previous: StyleSpecification = { version: 8, sources: {
      oldTiles: { type: "vector", url: "https://example.invalid/old" },
      "search-boundary": structuredClone(boundary),
      "search-properties": { type: "geojson", cluster: true, clusterRadius: 54, data: { type: "FeatureCollection", features: [{ type: "Feature", properties: { propertyId: "live-listing" }, geometry: { type: "Point", coordinates: [9.9, 57] } }] } },
    }, layers: [
      { id: "old-road", type: "line", source: "oldTiles", "source-layer": "transportation" },
      { id: "boundary-draft-line", type: "line", source: "search-boundary", paint: { "line-color": "#8bb7ff" } },
      { id: "property-clusters", type: "circle", source: "search-properties" },
    ] };
    const next: StyleSpecification = { version: 8, sources: { newTiles: { type: "vector", url: "https://example.invalid/new" } }, layers: [{ id: "background", type: "background", paint: { "background-color": "#0c0c0c" } }] };
    const before = structuredClone(previous);
    const result = preserveMapOverlays(previous, next, ["search-boundary", "search-properties"]);
    expect(Object.keys(result.sources)).toEqual(["newTiles", "search-boundary", "search-properties"]);
    expect(result.sources["search-boundary"]).toEqual(previous.sources["search-boundary"]);
    expect(result.sources["search-properties"]).toEqual(previous.sources["search-properties"]);
    expect(result.layers.map((layer) => layer.id)).toEqual(["background", "boundary-draft-line", "property-clusters"]);
    expect(previous).toEqual(before);
    expect(next.layers).toHaveLength(1);
  });

  it("passes the cancellation signal through so outdated theme requests can be aborted", async () => {
    const style: StyleSpecification = { version: 8, sources: {}, layers: [] };
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => style });
    vi.stubGlobal("fetch", request);
    const controller = new AbortController();
    expect(await fetchMapStyle("dark", controller.signal)).toEqual(style);
    expect(request).toHaveBeenCalledWith(mapStyleUrl("dark"), { signal: controller.signal });
  });

  it("rejects failed and malformed styles before replacing a usable map", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchMapStyle("dark", new AbortController().signal)).rejects.toThrow("503");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: "unavailable" }) }));
    await expect(fetchMapStyle("dark", new AbortController().signal)).rejects.toThrow("Invalid map style");
  });
});

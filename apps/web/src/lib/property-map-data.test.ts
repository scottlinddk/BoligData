import { describe, expect, it } from "vitest";
import type { Property } from "@shared/types/index";
import type { SearchBoundaryPoint } from "@shared/utils/search-boundary";
import { parseSearchBoundary, serializeSearchBoundary } from "@shared/utils/search-boundary";
import { boundaryMapData, mapPriceLabel, propertyMapData, viewportSearchBoundary } from "./property-map-data";

const saved: SearchBoundaryPoint[] = [[9, 55], [10, 55], [10, 56], [9, 56]];

describe("map boundary preview", () => {
  it("keeps the applied polygon while previewing a replacement and restores it on cancellation", () => {
    const draft: SearchBoundaryPoint[] = [[9.1, 55.1], [9.5, 55.1], [9.5, 55.5]];
    const preview = boundaryMapData(saved, draft);
    expect(preview.features.filter((feature) => feature.geometry.type === "Polygon")).toHaveLength(2);
    expect(preview.features.filter((feature) => feature.properties?.kind === "vertex")).toHaveLength(3);
    expect(boundaryMapData(saved, []).features).toEqual([preview.features[0]]);
    expect(saved).toHaveLength(4);
    expect(draft).toHaveLength(3);
  });

  it("renders points and an open line before enough vertices exist for a filled area", () => {
    const data = boundaryMapData(null, [[9, 55], [10, 56]]);
    expect(data.features.map((feature) => feature.geometry.type)).toEqual(["LineString", "Point", "Point"]);
    expect(parseSearchBoundary([[9, 55], [10, 56]])).toBeNull();
  });

  it("does not apply a crossing replacement although its draft is visible", () => {
    const crossing: SearchBoundaryPoint[] = [[9, 55], [10, 56], [10, 55], [9, 56]];
    expect(boundaryMapData(saved, crossing).features[0]).toEqual(boundaryMapData(saved, []).features[0]);
    expect(() => serializeSearchBoundary(crossing)).toThrow(RangeError);
  });

  it("gives keyboard users a valid, exactly bounded viewport rectangle", () => {
    const rectangle = viewportSearchBoundary(9.1, 55.2, 9.9, 55.8);
    expect(rectangle).toEqual([[9.1, 55.2], [9.9, 55.2], [9.9, 55.8], [9.1, 55.8]]);
    expect(parseSearchBoundary(serializeSearchBoundary(rectangle!))).toHaveLength(4);
    expect(viewportSearchBoundary(181, 55, 183, 56)).toBeNull();
    expect(viewportSearchBoundary(170, 55, -170, 56)).toBeNull();
    expect(viewportSearchBoundary(9, 55, 9, 56)).toBeNull();
  });
});

describe("map listing data", () => {
  it("keeps clusters honest by excluding duplicate identities and non-renderable coordinates", () => {
    const property = { id: "one", lon: 9.9, lat: 57.05 } as Property;
    const data = propertyMapData([property, property, { ...property, id: "nan", lat: NaN }, { ...property, id: "out", lon: 999 }, { ...property, id: "pole", lat: 90 }]);
    expect(data.features).toHaveLength(1);
    expect(data.features[0]?.properties?.propertyId).toBe("one");
    expect(data.features[0]?.geometry).toEqual({ type: "Point", coordinates: [9.9, 57.05] });
    expect(propertyMapData([]).features).toEqual([]);
  });

  it("labels actual asking prices with currency and never presents unknown prices as zero", () => {
    expect(mapPriceLabel(2_995_000, "da")).toBe("2,995 mio.");
    expect(mapPriceLabel(2_995_000, "en")).toBe("DKK 2.995m");
    expect(mapPriceLabel(995_000, "da")).toBe("995.000 kr.");
    expect(mapPriceLabel(NaN, "da")).toBe("Pris ukendt");
    expect(mapPriceLabel(0, "en")).toBe("Price unknown");
  });
});

import { describe, expect, it } from "vitest";
import { parseSearchBoundary, searchBoundaryBbox, searchBoundaryContains, serializeSearchBoundary, type SearchBoundaryPoint } from "@shared/utils/search-boundary";

const ring: SearchBoundaryPoint[] = [[9, 57], [10, 57], [10, 58], [9, 58]];

describe("drawn search boundary", () => {
  it("accepts JSON or coordinates and removes only an optional repeated closing point", () => {
    expect(parseSearchBoundary(JSON.stringify(ring))).toEqual(ring);
    expect(parseSearchBoundary([...ring, ring[0]])).toEqual(ring);
    expect(parseSearchBoundary(ring)).not.toBe(ring);
  });

  it("canonicalizes equivalent rotations and winding without losing coordinate precision", () => {
    const expected = JSON.stringify(ring);
    expect(serializeSearchBoundary(ring)).toBe(expected);
    expect(serializeSearchBoundary([...ring].reverse())).toBe(expected);
    expect(serializeSearchBoundary([...ring.slice(2), ...ring.slice(0, 2)])).toBe(expected);
    const precise: SearchBoundaryPoint[] = [[9.1234567891, 57.1234567891], [9.2234567891, 57.1234567891], [9.2234567891, 57.2234567891]];
    expect(parseSearchBoundary(serializeSearchBoundary(precise))).toEqual(precise);
    expect(ring).toEqual([[9, 57], [10, 57], [10, 58], [9, 58]]);
  });

  it("rejects invalid syntax, scalar/string coordinates, non-finite or out-of-range values", () => {
    for (const value of [undefined, null, "", "not json", "null", {}, [], [[0, 0], [1, 1]],
      [["9", 57], [10, 57], [10, 58]], [[9, 57, 1], [10, 57], [10, 58]],
      [[Number.NaN, 57], [10, 57], [10, 58]], [[9, Number.POSITIVE_INFINITY], [10, 57], [10, 58]],
      [[181, 57], [10, 57], [10, 58]], [[9, 91], [10, 57], [10, 58]], " ".repeat(16_385)]) {
      expect(parseSearchBoundary(value)).toBeNull();
    }
  });

  it("rejects collinear, repeated, crossing, touching and adjacent-overlap rings", () => {
    const bad: SearchBoundaryPoint[][] = [
      [[0, 0], [1, 1], [2, 2]],
      [[0, 0], [2, 0], [2, 2], [0, 0], [0, 2]],
      [[0, 0], [2, 2], [0, 2], [2, 0]],
      [[0, 0], [3, 0], [3, 3], [1.5, 0], [0, 3]],
      [[0, 0], [2, 0], [1, 0], [2, 2], [0, 2]],
    ];
    for (const shape of bad) {
      expect(parseSearchBoundary(shape)).toBeNull();
      expect(() => serializeSearchBoundary(shape)).toThrow(RangeError);
    }
  });

  it("rejects world-spanning and date-line rings whose local map interpretation is ambiguous", () => {
    expect(parseSearchBoundary([[-179, 55], [179, 55], [179, 57], [-179, 57]])).toBeNull();
    expect(parseSearchBoundary([[-90, 55], [90, 55], [90, 57], [-90, 57]])).toBeNull();
  });

  it("limits the open ring to 64 distinct vertices while allowing an optional 65th closing coordinate", () => {
    const circle = (count: number): SearchBoundaryPoint[] => Array.from({ length: count }, (_, i) => [9 + Math.cos(i / count * Math.PI * 2), 57 + Math.sin(i / count * Math.PI * 2)]);
    const sixtyFour = circle(64);
    expect(parseSearchBoundary(sixtyFour)).toHaveLength(64);
    expect(parseSearchBoundary([...sixtyFour, sixtyFour[0]])).toHaveLength(64);
    expect(parseSearchBoundary(circle(65))).toBeNull();
  });

  it("includes exact edges/vertices and distinguishes a concave boundary from its bounding rectangle", () => {
    const concave: SearchBoundaryPoint[] = [[9, 57], [10, 57], [10, 58], [9.5, 57.5], [9, 58]];
    expect(searchBoundaryBbox(concave)).toEqual([9, 57, 10, 58]);
    expect(searchBoundaryContains([9.5, 57.25], concave)).toBe(true);
    expect(searchBoundaryContains([9.5, 57], concave)).toBe(true);
    expect(searchBoundaryContains([9.5, 57.5], concave)).toBe(true);
    expect(searchBoundaryContains([9.5, 57.8], concave)).toBe(false);
    expect(searchBoundaryContains([8.9, 57.5], concave)).toBe(false);
    expect(searchBoundaryBbox("invalid")).toBeNull();
  });
});

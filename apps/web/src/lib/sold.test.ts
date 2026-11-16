import { describe, expect, it } from "vitest";
import soldJson from "@shared/data/sold-properties.json" with { type: "json" };
import type { SoldProperty } from "@shared/types/sold";
import { geocodeAll, pickSuggestion, type GeoCache } from "./sold-geocode";
import { makeSoldFormat } from "./sold-format";
import { applyFilter, average, discountPct, sortRows, summarize, toRow, toRows } from "./sold-stats";
import { buildSurface, colorDomain, rampExpression, RAMP } from "./sold-surface";

const sale = (over: Partial<SoldProperty> = {}): SoldProperty => ({
  id: "x", area: "kaerby", address: "Testvej 1", soldDate: "2026-01-01", areaSqm: 100, weightedAreaSqm: null, plotSqm: null,
  askPrice: 4_000_000, soldPrice: 3_800_000, daysOnMarket: 30, builtYear: null, energyLabel: null, note: null,
  outlierReason: null, areaUncertain: false, ...over,
});

describe("discount and price per m²", () => {
  it("is positive when sold under the listing price and negative when over", () => {
    expect(discountPct(4_000_000, 3_800_000)).toBeCloseTo(5, 10);
    expect(discountPct(2_845_000, 2_955_000)).toBeCloseTo(-3.866, 3);
  });
  it("is null without both prices, never zero", () => {
    expect(discountPct(null, 3_800_000)).toBeNull();
    expect(discountPct(4_000_000, null)).toBeNull();
  });
  it("leaves disputed areas out of price per m²", () => {
    expect(toRow(sale()).pricePerSqm).toBe(38_000);
    expect(toRow(sale({ areaUncertain: true })).pricePerSqm).toBeNull();
  });
});

describe("averages", () => {
  it("average ignores missing values and reports n and median", () => {
    expect(average([1, null, 3, 8])).toEqual({ mean: 4, median: 3, n: 3 });
    expect(average([null])).toBeNull();
  });
  it("summarize uses a different n per figure", () => {
    const rows = toRows([sale(), sale({ id: "y", askPrice: null, daysOnMarket: null, soldPrice: 3_000_000 })]);
    const s = summarize(rows);
    expect(s.soldPrice?.n).toBe(2);
    expect(s.discountPct?.n).toBe(1);
    expect(s.daysOnMarket?.n).toBe(1);
  });
  it("the outlier switch changes the discount average", () => {
    const rows = toRows([sale(), sale({ id: "r", askPrice: 5_000_000, soldPrice: 1_700_000, outlierReason: "ruin" })]);
    const all = summarize(applyFilter(rows, { area: "all", excludeOutliers: false }));
    const some = summarize(applyFilter(rows, { area: "all", excludeOutliers: true }));
    expect(all.discountPct?.mean).toBeCloseTo((5 + 66) / 2, 5);
    expect(some.discountPct?.mean).toBeCloseTo(5, 5);
  });
  it("sorts missing values last in both directions", () => {
    const rows = toRows([sale({ id: "a", address: "A", askPrice: null }), sale({ id: "b", address: "B", askPrice: 1 }), sale({ id: "c", address: "C", askPrice: 2 })]);
    expect(sortRows(rows, "askPrice", "asc").map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(sortRows(rows, "askPrice", "desc").map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});

describe("the supplied data", () => {
  const rows = toRows(soldJson as SoldProperty[]);
  it("has both neighbourhoods and unique ids", () => {
    expect(rows.filter((r) => r.area === "kaerby")).toHaveLength(38);
    expect(rows.filter((r) => r.area === "gl-hasseris")).toHaveLength(121);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
  it("reproduces the Kærby workbook's own average (sheet: -6.84 % on 27 sales, here as a positive discount)", () => {
    const kaerby = summarize(rows.filter((r) => r.area === "kaerby"));
    expect(kaerby.discountPct?.n).toBe(27);
    expect(kaerby.discountPct?.mean).toBeCloseTo(6.84, 1);
    // Same figure without Åvangen 14, as in the workbook's second average row (-4.57 %).
    const without = summarize(rows.filter((r) => r.area === "kaerby" && r.address !== "Åvangen 14"));
    expect(without.discountPct?.mean).toBeCloseTo(4.57, 1);
    expect(kaerby.daysOnMarket?.mean).toBeCloseTo(108.96, 1);
  });
  it("only Kærby has time on market", () => {
    expect(rows.filter((r) => r.area === "gl-hasseris" && r.daysOnMarket !== null)).toHaveLength(0);
  });
  it("flags the sales the source itself calls atypical", () => {
    const flagged = rows.filter((r) => r.outlierReason !== null).map((r) => r.address).sort();
    expect(flagged).toEqual(["Ferskenvej 37", "Johannes Hofmeisters Vej 10", "Mester Eriks Vej 44", "Under Lien 59", "Åvangen 14"].sort());
  });
});

describe("value surface", () => {
  const near = [
    { lat: 57.0, lon: 9.9, value: 10 },
    { lat: 57.0003, lon: 9.9004, value: 20 },
  ];
  it("is empty without points", () => {
    expect(buildSurface([]).features).toHaveLength(0);
  });
  it("is a weighted AVERAGE, so a crowded street is not hotter than a lone sale of the same value", () => {
    const lone = buildSurface([{ lat: 57, lon: 9.9, value: 50 }]);
    const crowd = buildSurface(Array.from({ length: 10 }, () => ({ lat: 57, lon: 9.9, value: 50 })));
    const peak = (c: ReturnType<typeof buildSurface>) => Math.max(...c.features.map((f) => f.properties.value));
    expect(peak(lone)).toBeCloseTo(50, 8);
    expect(peak(crowd)).toBeCloseTo(50, 8);
  });
  it("stays between the lowest and highest value and fades with distance", () => {
    const s = buildSurface(near);
    for (const f of s.features) expect(f.properties.value).toBeGreaterThanOrEqual(10 - 1e-9), expect(f.properties.value).toBeLessThanOrEqual(20 + 1e-9);
    const supports = s.features.map((f) => f.properties.support);
    expect(Math.max(...supports)).toBeLessThanOrEqual(1);
    expect(Math.min(...supports)).toBeGreaterThanOrEqual(0.15 - 1e-9);
  });
  it("draws closed polygons", () => {
    const ring = buildSurface(near).features[0]!.geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });
  it("colour domain is the 5th-95th percentile and never degenerate", () => {
    const values = [...Array.from({ length: 98 }, (_, i) => i), 1000, -1000];
    const [low, high] = colorDomain(values)!;
    expect(low).toBeGreaterThan(-1000);
    expect(high).toBeLessThan(1000);
    expect(colorDomain([5, 5, 5])).toEqual([4, 6]);
    expect(colorDomain([])).toBeNull();
  });
  it("ramp expression has one stop per colour", () => {
    const expr = rampExpression("value", [0, 4]);
    expect(expr.slice(0, 3)).toEqual(["interpolate", ["linear"], ["get", "value"]]);
    expect((expr.length - 3) / 2).toBe(RAMP.length);
    expect(expr[3]).toBe(0);
    expect(expr[expr.length - 2]).toBe(4);
  });
});

describe("geocoding", () => {
  const hit = (label: string, id: string | null = "11111111-1111-1111-1111-111111111111") => ({ kind: "address" as const, label, id });
  it("does not answer 'Vester Vænge Alle 3' with number 30, and requires the postcode", () => {
    const list = [hit("Vester Vænge Alle 30, 9000 Aalborg", "a"), hit("Vester Vænge Alle 3, 9400 Nørresundby", "b"), hit("Vester Vænge Alle 3, 9000 Aalborg", "c")];
    expect(pickSuggestion("Vester Vænge Alle 3", "9000", list)?.id).toBe("c");
    expect(pickSuggestion("Vester Vænge Alle 3", "9000", list.slice(0, 2))).toBeNull();
  });
  it("accepts a lettered house number", () => {
    expect(pickSuggestion("Skrædergyden 4B", "9000", [hit("Skrædergyden 4B, 9000 Aalborg", "z")])?.id).toBe("z");
  });
  it("uses the cache, caches 'missing' but not errors, and reports progress", async () => {
    const cache: GeoCache = { "A 1": [57, 9.9], "B 2": null };
    const seen: string[] = [];
    const lookup = async (a: string) => (a === "C 3" ? ({ status: "found", point: { lat: 57.1, lon: 9.8 } } as const) : a === "D 4" ? ({ status: "missing" } as const) : ({ status: "error" } as const));
    const progress: Array<[number, number]> = [];
    const { failed } = await geocodeAll(["A 1", "B 2", "C 3", "D 4", "E 5", "A 1"], {
      cache, signal: new AbortController().signal, lookup, concurrency: 2,
      onResult: (a, p) => seen.push(`${a}:${p ? "pt" : "none"}`),
      onProgress: (d, t) => progress.push([d, t]),
    });
    expect(failed).toBe(1);
    expect(cache["C 3"]).toEqual([57.1, 9.8]);
    expect(cache["D 4"]).toBeNull();
    expect("E 5" in cache).toBe(false);
    expect(seen).toContain("A 1:pt");
    expect(seen.filter((s) => s.startsWith("A 1"))).toHaveLength(1); // duplicates are looked up once
    expect(progress[progress.length - 1]).toEqual([5, 5]);
  });
});

describe("formatting", () => {
  const f = makeSoldFormat("da");
  it("formats discount with a minus only when sold over the listing price", () => {
    expect(f.discount(5.2)).toBe("5,2 %");
    expect(f.discount(-3.9)).toBe("−3,9 %");
    expect(f.discount(null)).toBe("–");
  });
  it("handles month-only dates and gaps", () => {
    expect(f.date("2025-10")).toMatch(/2025/);
    expect(f.date("2026-03-30")).toMatch(/30/);
    expect(f.date(null)).toBe("–");
  });
});

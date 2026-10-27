import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dstCategoryFor, fetchDstRegionalStats, jsonStatCells, quarterRange, regionForMunicipality } from "./dst-stats.js";

// Shape of the real StatBank JSON-stat v1 response, trimmed to two areas x one category x two keys.
const salesResponse = {
  dataset: {
    dimension: {
      id: ["OMRÅDE", "EJENDOMSKATE", "BNØGLE", "OVERDRAG", "ContentsCode", "Tid"],
      size: [2, 1, 2, 1, 1, 5],
      OMRÅDE: { category: { index: { "000": 0, "081": 1 } } },
      EJENDOMSKATE: { category: { index: { "0111": 0 } } },
      BNØGLE: { category: { index: { "2": 0, "3": 1 } } },
      OVERDRAG: { category: { index: { "1": 0 } } },
      ContentsCode: { category: { index: { EJEN77: 0 } } },
      Tid: { category: { index: { "2025K2": 0, "2025K3": 1, "2025K4": 2, "2026K1": 3, "2026K2": 4 } } },
    },
    // 000: sales then price (DKK 1000); 081: sales then price
    value: [10, 11, 12, 13, 14, 2000, 2100, 2200, 2300, 2400, 1, 2, 3, 4, null, 1500, 1600, 1700, 1800, 1900],
  },
};
const indexResponse = {
  dataset: {
    dimension: {
      id: ["OMRÅDE", "EJENDOMSKATE", "TAL", "ContentsCode", "Tid"],
      size: [1, 1, 1, 1, 2],
      OMRÅDE: { category: { index: { "081": 0 } } },
      EJENDOMSKATE: { category: { index: { "0111": 0 } } },
      TAL: { category: { index: { "310": 0 } } },
      ContentsCode: { category: { index: { EJ56: 0 } } },
      Tid: { category: { index: { "2026K1": 0, "2026K2": 1 } } },
    },
    value: [3.6, -0.8],
  },
};

describe("jsonStatCells", () => {
  it("expands row-major values into labelled cells", () => {
    const cells = jsonStatCells(indexResponse);
    expect(cells).toEqual([
      { dims: expect.objectContaining({ OMRÅDE: "081", TAL: "310", Tid: "2026K1" }), value: 3.6 },
      { dims: expect.objectContaining({ Tid: "2026K2" }), value: -0.8 },
    ]);
  });

  it("rejects an unexpected shape", () => {
    expect(() => jsonStatCells({ nope: true })).toThrow("Unexpected DST response shape");
  });
});

describe("quarterRange", () => {
  it("maps DST quarter codes to calendar dates", () => {
    expect(quarterRange("2026K2")).toEqual({ start: "2026-04-01", end: "2026-06-30" });
    expect(quarterRange("2025K1")).toEqual({ start: "2025-01-01", end: "2025-03-31" });
    expect(quarterRange("2026")).toBeNull();
  });
});

describe("region and category mapping", () => {
  it("maps Nordjylland municipalities to the region and everything else to Denmark", () => {
    expect(regionForMunicipality("Aalborg").code).toBe("081");
    expect(regionForMunicipality("Brønderslev").code).toBe("081");
    expect(regionForMunicipality("København").code).toBe("000");
  });
  it("maps property types to DST categories", () => {
    expect(dstCategoryFor("villa")).toBe("0111");
    expect(dstCategoryFor("terraced_house")).toBe("0111");
    expect(dstCategoryFor("apartment")).toBe("2103");
    expect(dstCategoryFor("other")).toBeNull();
  });
});

describe("fetchDstRegionalStats", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      const table = (JSON.parse(init.body) as { table: string }).table;
      return { ok: true, json: async () => (table === "EJEN77" ? salesResponse : indexResponse) };
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("converts DKK 1000 to DKK, derives prev-year values and skips suppressed cells", async () => {
    const rows = await fetchDstRegionalStats();
    const price = rows.filter((r) => r.region_code === "081" && r.stat_type === "avg_price");
    expect(price.map((r) => r.value)).toEqual([1_500_000, 1_600_000, 1_700_000, 1_800_000, 1_900_000]);
    expect(price.at(-1)).toMatchObject({ period_start: "2026-04-01", prev_year_value: 1_500_000, region_name: "Region Nordjylland" });
    expect(price[0]!.prev_year_value).toBeNull();

    const sales = rows.filter((r) => r.region_code === "081" && r.stat_type === "sales_count");
    expect(sales).toHaveLength(4); // the null (suppressed) quarter is dropped
    expect(rows.find((r) => r.stat_type === "price_change_yoy" && r.period_start === "2026-04-01")).toMatchObject({ value: -0.8, prev_year_value: null });
  });
});

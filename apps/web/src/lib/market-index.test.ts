import { describe, expect, it } from "vitest";
import { compareMarketMonths, marketChartSegments } from "./market-index";

describe("published market index comparison", () => {
  it("aligns differently ordered and incomplete series by month without carrying a price forward", () => {
    expect(compareMarketMonths(
      [{ month: "2026-03", value: 19_000 }, { month: "2025-12", value: 18_000 }],
      [{ month: "2026-01", value: 12_000 }, { month: "2025-12", value: null }],
    )).toEqual([
      { month: "2025-12", country: 18_000, municipality: null },
      { month: "2026-01", country: null, municipality: 12_000 },
      { month: "2026-02", country: null, municipality: null },
      { month: "2026-03", country: 19_000, municipality: null },
    ]);
  });

  it("breaks paths at missing months while retaining a genuine zero and an isolated point", () => {
    const rows = compareMarketMonths([
      { month: "2026-01", value: 0 }, { month: "2026-02", value: 1_000 },
      { month: "2026-03", value: null }, { month: "2026-04", value: 2_000 },
    ]);
    expect(marketChartSegments(rows, "country")).toEqual([
      [{ index: 0, month: "2026-01", value: 0 }, { index: 1, month: "2026-02", value: 1_000 }],
      [{ index: 3, month: "2026-04", value: 2_000 }],
    ]);
    expect(marketChartSegments(rows, "municipality")).toEqual([]);
    expect(compareMarketMonths([])).toEqual([]);
  });
});

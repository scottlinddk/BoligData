import { describe, expect, it } from "vitest";
import { monthlySeries, zipMarketSnapshot, type ZipMarketSnapshot } from "@shared/analysis/zip-market-stats";
import { zipPriceIndex } from "@shared/analysis/zip-price-index";

/** A snapshot whose sold price is a flat 10,000 kr/m² in 2023 and 15,000 kr/m² in 2026. */
function twoYearSnapshot(): ZipMarketSnapshot {
  const snapshot: ZipMarketSnapshot = structuredClone(zipMarketSnapshot);
  const points: Record<string, number> = {};
  for (let month = 1; month <= 12; month++) points[`2023-${String(month).padStart(2, "0")}`] = 10_000;
  for (let month = 1; month <= 12; month++) points[`2026-${String(month).padStart(2, "0")}`] = 15_000;
  snapshot.series.sold_per_area_price.points = points;
  snapshot.period = { from: "2023-01", to: "2026-12" };
  return snapshot;
}

describe("zipPriceIndex", () => {
  it("prices a 100 m² home at 1,000,000 kr in 2023 and 1,500,000 kr in 2026", () => {
    const index = zipPriceIndex({ postalCode: "9000", areaSqm: 100 }, twoYearSnapshot())!;
    expect(index.years.find((row) => row.year === 2023)).toMatchObject({ pricePerSqm: 10_000, valueDkk: 1_000_000 });
    expect(index.current).toMatchObject({ year: 2026, pricePerSqm: 15_000, valueDkk: 1_500_000 });
  });

  it("uses the sold series and the average of the months a year has", () => {
    const index = zipPriceIndex({ postalCode: "9000", areaSqm: 100 })!;
    const sold2026 = monthlySeries("sold_per_area_price").filter((point) => point.month.startsWith("2026"));
    const average = sold2026.reduce((sum, point) => sum + point.value, 0) / sold2026.length;
    expect(index.current.year).toBe(2026);
    expect(index.current.months).toBe(sold2026.length);
    expect(index.current.pricePerSqm).toBe(Math.round(average));
    expect(index.current.valueDkk).toBe(100 * Math.round(average));
    expect(index.latestMonth).toBe("2026-09");
  });

  it("keeps size x price checkable by hand", () => {
    const index = zipPriceIndex({ postalCode: "9000", areaSqm: 137 })!;
    for (const row of index.years) expect(row.valueDkk).toBe(137 * row.pricePerSqm);
  });

  it("covers only the postcode the snapshot is for", () => {
    expect(zipPriceIndex({ postalCode: "9200", areaSqm: 100 })).toBeNull();
    expect(zipPriceIndex({ postalCode: null, areaSqm: 100 })).toBeNull();
    expect(zipPriceIndex({ postalCode: " 9000 ", areaSqm: 100 })).not.toBeNull();
  });

  it("gives no index without a usable size", () => {
    for (const areaSqm of [null, undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(zipPriceIndex({ postalCode: "9000", areaSqm })).toBeNull();
    }
  });
});

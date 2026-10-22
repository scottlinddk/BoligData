import { monthlySeries, yearlyAverages, zipMarketSnapshot, type ZipMarketSnapshot } from "./zip-market-stats.js";

/**
 * Price by square meter price index: a home's size times the postcode's average sold price per m².
 *
 * With 100 m² and an average of 10,000 kr/m² in 2023 the home is worth 1,000,000 kr at the 2023 level;
 * at 15,000 kr/m² in 2026 it is worth 1,500,000 kr. The index carries one number, the market's m² price,
 * so it knows nothing about the home's condition, plot, location within the postcode or building type.
 * It uses the sold series (actual sales), not the asking series.
 */

export interface ZipPriceIndexYear {
  year: number;
  /** Average sold price per m² for the year, rounded to whole kroner so size x price can be checked by hand. */
  pricePerSqm: number;
  /** Months of the year with data; fewer than 12 means a year in progress. */
  months: number;
  valueDkk: number;
}

export interface ZipPriceIndex {
  postalCode: string;
  municipality: string;
  areaSqm: number;
  /** The newest year in the snapshot, possibly a partial one. */
  current: ZipPriceIndexYear;
  /** Every year in the snapshot, oldest first. */
  years: ZipPriceIndexYear[];
  /** Newest month the snapshot covers, "YYYY-MM". */
  latestMonth: string;
}

/** Null when the snapshot does not cover the postcode or the size is not a usable number. */
export function zipPriceIndex(
  input: { postalCode: string | null | undefined; areaSqm: number | null | undefined },
  snapshot: ZipMarketSnapshot = zipMarketSnapshot,
): ZipPriceIndex | null {
  const postalCode = input.postalCode?.trim();
  const { areaSqm } = input;
  if (!postalCode || postalCode !== snapshot.source.locationName) return null;
  if (typeof areaSqm !== "number" || !Number.isFinite(areaSqm) || areaSqm <= 0) return null;

  const years = yearlyAverages(monthlySeries("sold_per_area_price", snapshot)).map((row): ZipPriceIndexYear => {
    const pricePerSqm = Math.round(row.average);
    return { year: row.year, pricePerSqm, months: row.months, valueDkk: Math.round(areaSqm * pricePerSqm) };
  });
  const current = years[years.length - 1];
  if (!current) return null;
  return { postalCode, municipality: snapshot.source.municipality, areaSqm, current, years, latestMonth: snapshot.period.to };
}

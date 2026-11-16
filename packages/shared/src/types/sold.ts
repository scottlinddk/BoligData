/** Which neighbourhood a sale belongs to. */
export type SoldArea = "kaerby" | "gl-hasseris";

/**
 * One registered sale of a house, as supplied in the Kærby workbook and the Gl. Hasseris CSV.
 * Every figure is optional: a missing value stays `null` and is never estimated, so an average
 * only ever uses the sales that actually have that figure.
 */
export interface SoldProperty {
  id: string;
  area: SoldArea;
  address: string;
  /** ISO `YYYY-MM-DD`, or `YYYY-MM` where only the month is known. */
  soldDate: string | null;
  /** BBR residential area in m². */
  areaSqm: number | null;
  /** Boligsiden's weighted area in m² (Kærby only). */
  weightedAreaSqm: number | null;
  plotSqm: number | null;
  /** Listing price in DKK. Kærby: original listing price. Gl. Hasseris: as supplied (see docs/sold.md). */
  askPrice: number | null;
  soldPrice: number | null;
  /** Days on market (Kærby only). */
  daysOnMarket: number | null;
  builtYear: number | null;
  energyLabel: string | null;
  note: string | null;
  /** Set when the sale distorts averages (part sale, teardown, ruin). Excluded when "ekskl. afvigende" is on. */
  outlierReason: string | null;
  /** The area is disputed, so the sale is left out of m² and price-per-m² figures. */
  areaUncertain: boolean;
}

import { fetchJson } from "./shared/http.js";

/**
 * Regional market statistics from Danmarks Statistik's open StatBank API
 * (no key needed). Two tables, both quarterly and published per region:
 * - EJEN77: sales of real property: number of sales and average price
 *   (DKK 1000) of ordinary free trades
 * - EJ56: price index, used only for its year-over-year change
 * DST has no municipality level, price per m² or time on market, so these are
 * regional context next to the per-municipality Boligsiden series.
 */
const DST_DATA_URL = process.env.DST_STATBANK_URL ?? "https://api.statbank.dk/v1/data";

export const DST_STAT_TYPES = ["avg_price", "sales_count", "price_change_yoy"] as const;
export type DstStatType = (typeof DST_STAT_TYPES)[number];

export interface DstRegion {
  code: string;
  name: string;
}
export const DST_DENMARK: DstRegion = { code: "000", name: "Hele landet" };
export const DST_REGION_NORDJYLLAND: DstRegion = { code: "081", name: "Region Nordjylland" };

/** The 11 municipalities of Region Nordjylland. Anything else falls back to the national series. */
const NORDJYLLAND_MUNICIPALITIES = new Set([
  "Aalborg", "Brønderslev", "Frederikshavn", "Hjørring", "Jammerbugt", "Læsø",
  "Mariagerfjord", "Morsø", "Rebild", "Thisted", "Vesthimmerlands",
]);

export function regionForMunicipality(municipality: string): DstRegion {
  return NORDJYLLAND_MUNICIPALITIES.has(municipality) ? DST_REGION_NORDJYLLAND : DST_DENMARK;
}

export const DST_REGIONS = [DST_DENMARK, DST_REGION_NORDJYLLAND];

/** Our property_type → DST "category of real property" (EJENDOMSKATE). "other" has none. */
const DST_CATEGORY: Record<string, string> = {
  villa: "0111", // one-family houses (DST does not split out terraced houses here)
  terraced_house: "0111",
  apartment: "2103", // owner-occupied flats, total
  summer_house: "0801",
  farm: "0509",
};
// The price index is not published for agricultural properties.
const INDEX_CATEGORIES = ["0111", "2103", "0801"];

export function dstCategoryFor(propertyType: string): string | null {
  return DST_CATEGORY[propertyType] ?? null;
}

export interface RegionalStatRow {
  source: "dst";
  region_code: string;
  region_name: string;
  category_code: string;
  stat_type: DstStatType;
  period_start: string;
  period_end: string;
  value: number;
  prev_year_value: number | null;
}

interface JsonStatCell {
  dims: Record<string, string>;
  value: number | null;
}

/** Flattens a JSON-stat v1 `dataset` (row-major values) into one cell per value. */
export function jsonStatCells(raw: unknown): JsonStatCell[] {
  const dataset = (raw as { dataset?: { dimension?: Record<string, unknown>; value?: unknown } } | null)?.dataset;
  const dimension = dataset?.dimension as (Record<string, unknown> & { id?: string[]; size?: number[] }) | undefined;
  if (!dataset || !dimension || !Array.isArray(dimension.id) || !Array.isArray(dimension.size) || !Array.isArray(dataset.value)) {
    throw new Error("Unexpected DST response shape");
  }
  const ids = dimension.id;
  const codes = ids.map((id) => {
    const index = (dimension[id] as { category?: { index?: Record<string, number> | string[] } } | undefined)?.category?.index;
    if (!index) throw new Error(`DST response is missing categories for ${id}`);
    return Array.isArray(index) ? index : Object.keys(index).sort((a, b) => (index as Record<string, number>)[a]! - (index as Record<string, number>)[b]!);
  });
  const values = dataset.value as Array<number | null>;
  const cells: JsonStatCell[] = [];
  for (let i = 0; i < values.length; i++) {
    const dims: Record<string, string> = {};
    let rest = i;
    for (let d = ids.length - 1; d >= 0; d--) {
      const size = dimension.size[d]!;
      dims[ids[d]!] = codes[d]![rest % size]!;
      rest = Math.floor(rest / size);
    }
    const value = values[i];
    cells.push({ dims, value: typeof value === "number" && Number.isFinite(value) ? value : null });
  }
  return cells;
}

/** "2026K2" → first and last day of that quarter. */
export function quarterRange(code: string): { start: string; end: string } | null {
  const match = /^(\d{4})K([1-4])$/.exec(code);
  if (!match) return null;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const start = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
  const end = new Date(Date.UTC(year, quarter * 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

const QUARTERS_KEPT = 12;

function post(table: string, variables: Array<{ code: string; values: string[] }>): Promise<unknown> {
  return fetchJson(DST_DATA_URL, {
    method: "POST",
    body: JSON.stringify({ table, format: "JSONSTAT", lang: "da", variables }),
    headers: { "Content-Type": "application/json" },
    attempts: 2,
    timeoutMs: 15_000,
  });
}

/**
 * Builds the rows for the given regions: the last `QUARTERS_KEPT` quarters of
 * average price, sales count and price-index change. `prev_year_value` is the
 * value four quarters earlier, taken from the same series.
 */
export async function fetchDstRegionalStats(regions: DstRegion[] = DST_REGIONS): Promise<RegionalStatRow[]> {
  const codes = regions.map((r) => r.code);
  const nameByCode = new Map(regions.map((r) => [r.code, r.name]));
  const categories = [...new Set(Object.values(DST_CATEGORY))];

  const [sales, index] = await Promise.all([
    post("EJEN77", [
      { code: "OMRÅDE", values: codes },
      { code: "EJENDOMSKATE", values: categories },
      { code: "BNØGLE", values: ["2", "3"] },
      { code: "OVERDRAG", values: ["1"] },
      { code: "Tid", values: ["*"] },
    ]),
    post("EJ56", [
      { code: "OMRÅDE", values: codes },
      { code: "EJENDOMSKATE", values: INDEX_CATEGORIES },
      { code: "TAL", values: ["310"] },
      { code: "Tid", values: ["*"] },
    ]),
  ]);

  const series = new Map<string, Map<string, number>>(); // region|category|stat → quarter code → value
  const add = (region: string, category: string, stat: DstStatType, quarter: string, value: number) => {
    const key = `${region}|${category}|${stat}`;
    if (!series.has(key)) series.set(key, new Map());
    series.get(key)!.set(quarter, value);
  };
  for (const { dims, value } of jsonStatCells(sales)) {
    if (value === null) continue;
    const region = dims["OMRÅDE"]!;
    const category = dims["EJENDOMSKATE"]!;
    const quarter = dims["Tid"]!;
    if (dims["BNØGLE"] === "2") add(region, category, "sales_count", quarter, value);
    // DST reports the average price in DKK 1000.
    if (dims["BNØGLE"] === "3") add(region, category, "avg_price", quarter, value * 1000);
  }
  for (const { dims, value } of jsonStatCells(index)) {
    if (value !== null) add(dims["OMRÅDE"]!, dims["EJENDOMSKATE"]!, "price_change_yoy", dims["Tid"]!, value);
  }

  const rows: RegionalStatRow[] = [];
  for (const [key, byQuarter] of series) {
    const [region, category, stat] = key.split("|") as [string, string, DstStatType];
    const quarters = [...byQuarter.keys()].filter((q) => quarterRange(q)).sort();
    for (const quarter of quarters.slice(-QUARTERS_KEPT)) {
      const range = quarterRange(quarter)!;
      const year = Number(quarter.slice(0, 4));
      const prev = stat === "price_change_yoy" ? undefined : byQuarter.get(`${year - 1}${quarter.slice(4)}`);
      rows.push({
        source: "dst",
        region_code: region,
        region_name: nameByCode.get(region) ?? region,
        category_code: category,
        stat_type: stat,
        period_start: range.start,
        period_end: range.end,
        value: byQuarter.get(quarter)!,
        prev_year_value: prev ?? null,
      });
    }
  }
  return rows;
}

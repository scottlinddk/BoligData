import { envInt, fetchJson } from "./http.js";
import { asFiniteNumber, asNonEmptyString } from "./map-utils.js";

/**
 * Boligsiden's Markedsindeks statistics (boligsiden.dk/markedsindeks) come
 * from the unofficial `POST /cases/stats` endpoint on the same API host as
 * the listing search: body is an array of {type, locationType, locationName,
 * addressType, from, to}; response is one array of monthly points per item.
 * `locationName` is case-sensitive ("Aalborg", not "aalborg" → null).
 */
const STATS_URL = process.env.BOLIGSIDEN_STATS_URL ?? "https://api.boligsiden.dk/cases/stats";

export const STAT_TYPES = ["sold_per_area_price", "sold_time_on_market", "sold_per_area_price_change"] as const;
export type StatType = (typeof STAT_TYPES)[number];

/** Our CHECK-constrained property_type → Boligsiden stats addressType. */
const STATS_ADDRESS_TYPE: Record<string, string> = {
  villa: "villa",
  apartment: "condo",
  terraced_house: "terraced house",
  summer_house: "holiday house",
  farm: "farm",
};

export interface MarketStatRow {
  location_type: "municipality";
  location_name: string;
  property_type: string;
  stat_type: StatType;
  period_start: string;
  period_end: string;
  value: number;
  prev_month_value: number | null;
  prev_year_value: number | null;
}

function get(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function mapStatPoint(raw: unknown, propertyType: string): MarketStatRow | null {
  const type = asNonEmptyString(get(raw, "type"));
  const name = asNonEmptyString(get(raw, "locationName"));
  const from = asNonEmptyString(get(raw, "from"));
  const to = asNonEmptyString(get(raw, "to"));
  const value = asFiniteNumber(get(raw, "value"));
  if (!type || !(STAT_TYPES as readonly string[]).includes(type) || !name || !from || !to || value === null) {
    return null;
  }
  return {
    location_type: "municipality",
    location_name: name,
    property_type: propertyType,
    stat_type: type as StatType,
    period_start: from,
    period_end: to,
    value,
    prev_month_value: asFiniteNumber(get(raw, "previousMonth", "value")),
    prev_year_value: asFiniteNumber(get(raw, "previousYear", "value")),
  };
}

/** Whether Boligsiden publishes Markedsindeks stats for this property type ("other" has none). */
export function hasStatsCategory(propertyType: string): boolean {
  return propertyType in STATS_ADDRESS_TYPE;
}

/**
 * Fetches the last `months` months of every stat type for one
 * (municipality, property_type) pair. Throws on request failure so the caller
 * can skip the pair and keep the rest.
 */
export async function fetchPairStats(
  municipality: string,
  propertyType: string,
  today = new Date(),
): Promise<MarketStatRow[]> {
  const addressType = STATS_ADDRESS_TYPE[propertyType];
  if (!addressType) return [];

  const months = envInt("MARKET_STATS_MONTHS", 12, 1, 36);
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months, 1)).toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);
  const body = JSON.stringify(
    STAT_TYPES.map((type) => ({ type, locationType: "municipality", locationName: municipality, addressType, from, to })),
  );
  const series = await fetchJson<unknown[]>(STATS_URL, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
    attempts: 2,
    timeoutMs: 8_000,
  });
  const rows: MarketStatRow[] = [];
  for (const points of Array.isArray(series) ? series : []) {
    for (const point of Array.isArray(points) ? points : []) {
      const row = mapStatPoint(point, propertyType);
      if (row) rows.push(row);
    }
  }
  return rows;
}

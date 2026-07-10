import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SearchPropertiesQuery,
  SearchPropertiesResponse,
} from "../../../../packages/shared/src/types/api";
import { rowToProperty, rowToPropertySummary } from "./row-mappers";

const SORT_COLUMNS: Record<string, string> = {
  listingDate: "listing_date",
  price: "price",
  pricePerSqm: "price_per_sqm",
  daysOnMarket: "listing_date",
};

export const DEFAULT_PAGE_SIZE = 50;

/**
 * Ceiling on how many rows a single search request can ask for. Env-backed
 * so it can be raised/lowered later without a deploy of new code.
 */
function maxPageSize(): number {
  const raw = Number(process.env.SEARCH_MAX_PAGE_SIZE);
  return Number.isFinite(raw) && raw >= 1 ? Math.trunc(raw) : 100;
}

// PostgREST's `or()` filter string treats `,`, `(`, `)`, and `.` as syntax —
// strip them from free-text input so a search term can't inject extra
// filter conditions. `%`/`_` are left intact; they're the ILIKE wildcards.
function sanitizeForOrFilter(value: string): string {
  return value.replace(/[,().]/g, "").trim();
}

function resolveSort(sortField: string, sortDirection: string) {
  const column = SORT_COLUMNS[sortField] ?? "listing_date";
  let ascending = sortDirection === "asc";
  // Fewer days on market = more recent = larger listing_date, so the
  // direction is inverted relative to the underlying column.
  if (sortField === "daysOnMarket") ascending = !ascending;
  return { column, ascending };
}

/**
 * Anonymous callers only ever see the listing name (address) plus the total
 * match count; signing in reveals the full record. This is enforced here
 * (not just hidden in the UI) by selecting fewer columns for the anon path.
 */
export async function searchProperties(
  client: SupabaseClient,
  query: SearchPropertiesQuery,
  authenticated: boolean,
): Promise<SearchPropertiesResponse> {
  const limit = Math.min(Math.max(query.limit ?? DEFAULT_PAGE_SIZE, 1), maxPageSize());
  const offset = Math.max(query.offset ?? 0, 0);
  const { column, ascending } = resolveSort(query.sortField ?? "listingDate", query.sortDirection ?? "desc");

  const columns = authenticated ? "*" : "id, address";
  let builder = client.from("properties").select(columns, { count: "exact" }).eq("status", "active");

  if (query.location) {
    const term = sanitizeForOrFilter(query.location);
    if (term) builder = builder.or(`address.ilike.%${term}%,municipality.ilike.%${term}%`);
  }
  if (query.minPrice != null) builder = builder.gte("price", query.minPrice);
  if (query.maxPrice != null) builder = builder.lte("price", query.maxPrice);
  if (query.minSqm != null) builder = builder.gte("sqm", query.minSqm);
  if (query.maxSqm != null) builder = builder.lte("sqm", query.maxSqm);
  if (query.minBuildingYear != null) builder = builder.gte("building_year", query.minBuildingYear);
  if (query.maxBuildingYear != null) builder = builder.lte("building_year", query.maxBuildingYear);
  if (query.maxDaysOnMarket != null) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - query.maxDaysOnMarket);
    builder = builder.gte("listing_date", cutoff.toISOString().slice(0, 10));
  }

  const { data, count, error } = await builder
    .order(column, { ascending })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const total = count ?? 0;
  return {
    authenticated,
    properties: authenticated ? (data ?? []).map(rowToProperty) : [],
    summaries: authenticated ? [] : (data ?? []).map(rowToPropertySummary),
    total,
    limit,
    offset,
    page: Math.floor(offset / limit) + 1,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BbrData, RiskFlags } from "../../../../packages/shared/src/types/index.js";
import type {
  SearchPropertiesQuery,
  SearchPropertiesResponse,
} from "../../../../packages/shared/src/types/api.js";
import { rowToProperty, rowToPropertySummary } from "./row-mappers.js";

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

/**
 * Splits a free-text location query into its street/city text and an
 * optional 4-digit Danish postal code, e.g. "Rundvejen 7, 9000" -> address
 * text "Rundvejen 7" + postal code "9000". Without this split, a query that
 * includes a zip code never matched anything: sanitizeForOrFilter() strips
 * the comma (PostgREST `or()` syntax) but left the zip digits appended to
 * the address term, so "Rundvejen 7 9000" was searched as one substring
 * against a stored `address` column that only ever holds "Rundvejen 7" —
 * the zip lives in its own `postal_code` column and was never checked at
 * all.
 */
export function splitLocationQuery(raw: string): { text: string; postalCode: string | null } {
  const match = raw.match(/\b(\d{4})\b/);
  const postalCode = match ? match[1] : null;
  const text = (postalCode ? raw.replace(match![0], " ") : raw).trim();
  return { text, postalCode };
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
    const { text, postalCode } = splitLocationQuery(query.location);
    const term = sanitizeForOrFilter(text);
    if (term) builder = builder.or(`address.ilike.%${term}%,municipality.ilike.%${term}%`);
    if (postalCode) builder = builder.eq("postal_code", postalCode);
  }
  if (query.propertyTypes && query.propertyTypes.length > 0) {
    builder = builder.in("property_type", query.propertyTypes);
  }
  if (query.postnummer) {
    const term = sanitizeForOrFilter(query.postnummer);
    if (term) builder = builder.ilike("postal_code", `${term}%`);
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
  if (query.createdAfter) builder = builder.gt("created_at", query.createdAfter);

  const { data, count, error } = await builder
    .order(column, { ascending })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const total = count ?? 0;

  // BBR data lives on a separate enrichments row (Fase 2 enrichment, not a
  // properties column) — batch-fetch it for the page's property ids, same
  // pattern comparables.ts uses for sold_price_history, so listing cards get
  // energy label/heating without a per-card round trip.
  const bbrByPropertyId = new Map<string, BbrData>();
  const riskByPropertyId = new Map<string, RiskFlags>();
  if (authenticated && (data ?? []).length > 0) {
    const propertyIds = (data as any[]).map((row) => row.id);
    const { data: enrichments } = await client
      .from("enrichments")
      .select("property_id, bbr_data, risk_flags")
      .in("property_id", propertyIds);
    for (const row of enrichments ?? []) {
      if (row.bbr_data) bbrByPropertyId.set(row.property_id, row.bbr_data);
      if (row.risk_flags) riskByPropertyId.set(row.property_id, row.risk_flags);
    }
  }

  return {
    authenticated,
    properties: authenticated
      ? (data as any[]).map((row) =>
          rowToProperty(row, bbrByPropertyId.get(row.id) ?? null, riskByPropertyId.get(row.id) ?? null),
        )
      : [],
    summaries: authenticated ? [] : (data ?? []).map(rowToPropertySummary),
    total,
    limit,
    offset,
    page: Math.floor(offset / limit) + 1,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

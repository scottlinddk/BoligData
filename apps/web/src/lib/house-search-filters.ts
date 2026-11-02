import { HOUSE_SEARCH_STATUSES, type HouseSearchEntry, type HouseSearchStatus } from "@shared/types/house-search";
import { isRealIsoDate } from "@/lib/house-search-schema";

export interface HouseSearchFilters {
  /** Empty means every status. */
  statuses: HouseSearchStatus[];
  /** Inclusive ISO dates. */
  from: string | null;
  to: string | null;
}

export const NO_FILTERS: HouseSearchFilters = { statuses: [], from: null, to: null };

/** Reads filters from the URL. Anything malformed is dropped, never trusted. */
export function parseFilters(params: URLSearchParams): HouseSearchFilters {
  const statuses = (params.get("status") ?? "")
    .split(",")
    .filter((s): s is HouseSearchStatus => (HOUSE_SEARCH_STATUSES as readonly string[]).includes(s));
  const date = (key: string) => {
    const value = params.get(key);
    return value && isRealIsoDate(value) ? value : null;
  };
  return { statuses: [...new Set(statuses)], from: date("from"), to: date("to") };
}

/** Writes only non-default filters, so a clean URL means "no filters". */
export function serializeFilters(filters: HouseSearchFilters, base = new URLSearchParams()): URLSearchParams {
  const params = new URLSearchParams(base);
  for (const key of ["status", "from", "to"]) params.delete(key);
  if (filters.statuses.length > 0) params.set("status", filters.statuses.join(","));
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return params;
}

export function applyFilters(entries: HouseSearchEntry[], filters: HouseSearchFilters): HouseSearchEntry[] {
  return entries.filter(
    (e) =>
      (filters.statuses.length === 0 || filters.statuses.includes(e.status)) &&
      (filters.from === null || e.seenAt >= filters.from) &&
      (filters.to === null || e.seenAt <= filters.to),
  );
}

export function hasActiveFilters(filters: HouseSearchFilters): boolean {
  return filters.statuses.length > 0 || filters.from !== null || filters.to !== null;
}

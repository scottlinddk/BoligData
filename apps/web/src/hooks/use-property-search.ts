import { queryOptions, useQuery } from "@tanstack/react-query";
import { searchProperties } from "@/lib/api";
import type { FiltersWithSort } from "@/lib/url-filters";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { useAuth } from "@/hooks/use-auth";

export function propertySearchOptions(
  filters: FiltersWithSort,
  offset: number,
  pageSize: number,
  userId: string | null,
) {
  return queryOptions({
    // Separate anonymous results and each account's authenticated results.
    queryKey: ["properties", filters, offset, pageSize, userId],
    queryFn: () =>
      searchProperties({
        ...filters,
        limit: pageSize,
        offset,
      }),
    // Keep the current page visible while paginating, but never present an old
    // area or a different authentication state as a match for new filters.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[4] === userId &&
      JSON.stringify(previousQuery.queryKey[1]) === JSON.stringify(filters)
        ? previousData
        : undefined,
  });
}

export function usePropertySearch(
  filters: FiltersWithSort,
  offset: number = 0,
  pageSize: number = DEFAULT_PAGE_SIZE,
) {
  const { session } = useAuth();
  return useQuery(propertySearchOptions(filters, offset, pageSize, session?.user.id ?? null));
}

import { useQuery } from "@tanstack/react-query";
import { searchProperties } from "@/lib/api";
import type { FiltersWithSort } from "@/lib/url-filters";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { useAuth } from "@/hooks/use-auth";

export function usePropertySearch(
  filters: FiltersWithSort,
  offset: number = 0,
  pageSize: number = DEFAULT_PAGE_SIZE,
) {
  const { session } = useAuth();
  return useQuery({
    // The session token is part of the key so signing in/out immediately
    // re-fetches instead of showing a stale anonymous/authenticated result.
    queryKey: ["properties", filters, offset, pageSize, Boolean(session)],
    queryFn: () =>
      searchProperties({
        ...filters,
        limit: pageSize,
        offset,
      }),
    placeholderData: (prev) => prev,
  });
}

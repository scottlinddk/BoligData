import { useQuery } from "@tanstack/react-query";
import { searchProperties } from "@/lib/api";
import type { FiltersWithSort } from "@/lib/url-filters";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

export function usePropertySearch(filters: FiltersWithSort, offset: number = 0) {
  return useQuery({
    queryKey: ["properties", filters, offset],
    queryFn: () =>
      searchProperties({
        ...filters,
        limit: DEFAULT_PAGE_SIZE,
        offset,
      }),
    placeholderData: (prev) => prev,
  });
}

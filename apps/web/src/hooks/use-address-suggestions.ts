import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { MIN_QUERY_LENGTH, normalizeQuery, searchAddresses } from "@/lib/address-search";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const DEBOUNCE_MS = 250;

/**
 * Autocomplete suggestions for the text typed so far.
 *
 * `placeholderData: keepPreviousData` keeps the last list on screen while the
 * next one loads, so the dropdown doesn't flash empty on every keystroke.
 * TanStack passes an AbortSignal to the query function, which cancels a request
 * whose text has already been superseded.
 */
export function useAddressSuggestions(text: string) {
  const query = normalizeQuery(text);
  const debounced = useDebouncedValue(query, DEBOUNCE_MS);
  const enabled = debounced.length >= MIN_QUERY_LENGTH;

  const result = useQuery({
    queryKey: ["address-suggestions", debounced],
    queryFn: ({ signal }) => searchAddresses(debounced, signal),
    enabled,
    staleTime: 60_000,
    retry: 1,
    placeholderData: keepPreviousData,
  });

  return {
    suggestions: enabled ? (result.data ?? []) : [],
    isLoading: enabled && result.isFetching,
    isError: enabled && result.isError,
    /** True while the shown list still belongs to an older version of the text. */
    isStale: query !== debounced,
  };
}

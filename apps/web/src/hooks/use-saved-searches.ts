import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSearch, listSearches, updateAlert } from "@/lib/api";
import type { CreateSearchBody, UpdateAlertBody } from "@shared/types/api";

export function useSavedSearches() {
  const queryClient = useQueryClient();

  const searchesQuery = useQuery({
    queryKey: ["searches"],
    queryFn: listSearches,
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateSearchBody) => createSearch(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["searches"] }),
  });

  const updateAlertMutation = useMutation({
    mutationFn: ({ searchId, body }: { searchId: string; body: UpdateAlertBody }) =>
      updateAlert(searchId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["searches"] }),
  });

  return {
    searches: searchesQuery.data ?? [],
    isLoading: searchesQuery.isLoading,
    createSearch: createMutation.mutateAsync,
    updateAlert: updateAlertMutation.mutateAsync,
  };
}

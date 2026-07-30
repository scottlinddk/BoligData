import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSearch, listSearches, updateAlert } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { CreateSearchBody, UpdateAlertBody } from "@shared/types/api";

export function useSavedSearches() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // /api/searches is behind requireUser. SearchPage ("/") is public and calls
  // this hook for its "save this search" button, so without the gate every
  // anonymous visitor fired an Authorization-less GET and got back
  // 401 {"error":"Missing bearer token"}. Same pattern AccountMenu already
  // uses for notifications/conversations.
  const searchesQuery = useQuery({
    queryKey: ["searches"],
    queryFn: listSearches,
    enabled: !!user,
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

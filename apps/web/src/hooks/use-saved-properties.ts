import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addFavorite, listFavorites, removeFavorite } from "@/lib/api";

/** Server-backed favorites (see /api/favorites), so advisors can see connected users' saves. */
export function useSavedProperties() {
  const queryClient = useQueryClient();

  const favoritesQuery = useQuery({
    queryKey: ["favorites"],
    queryFn: listFavorites,
  });

  const savedIds = new Set((favoritesQuery.data?.favorites ?? []).map((f) => f.propertyId));

  const addMutation = useMutation({
    mutationFn: (propertyId: string) => addFavorite({ propertyId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["favorites"] }),
  });

  const removeMutation = useMutation({
    mutationFn: (propertyId: string) => removeFavorite(propertyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["favorites"] }),
  });

  const isSaved = useCallback((id: string) => savedIds.has(id), [savedIds]);

  const toggle = useCallback(
    async (id: string): Promise<boolean> => {
      if (savedIds.has(id)) {
        await removeMutation.mutateAsync(id);
        return false;
      }
      await addMutation.mutateAsync(id);
      return true;
    },
    [savedIds, addMutation, removeMutation],
  );

  return {
    isSaved,
    toggle,
    properties: favoritesQuery.data?.properties ?? [],
    isLoading: favoritesQuery.isLoading,
  };
}

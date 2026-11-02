import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createHousehold, getMyHousehold, joinHousehold } from "@/lib/house-search-api";
import { useAuth } from "@/hooks/use-auth";

export const householdKey = (userId: string | undefined) => ["household", userId] as const;

/** The signed-in user's household (null until they create or join one). */
export function useHousehold() {
  const { user } = useAuth();
  const client = useQueryClient();
  const key = householdKey(user?.id);

  const query = useQuery({
    queryKey: key,
    queryFn: () => getMyHousehold(user!.id),
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: (name: string) => createHousehold(name),
    onSuccess: (household) => client.setQueryData(key, household),
  });

  const join = useMutation({
    mutationFn: (inviteCode: string) => joinHousehold(inviteCode),
    onSuccess: (household) => client.setQueryData(key, household),
  });

  return {
    household: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    create,
    join,
  };
}

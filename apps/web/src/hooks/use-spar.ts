import { useQuery } from "@tanstack/react-query";
import { getSparEstimate } from "@/lib/api";
import { useAuth } from "./use-auth";

export function useSparEstimate(propertyId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["spar", user?.id, propertyId],
    queryFn: () => getSparEstimate(propertyId),
    enabled: !!user && !!propertyId,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
}

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { getMiljoegisNoise } from "@/lib/api";
import type { NoiseMetric, NoiseSource } from "@shared/types/miljoegis-noise";

export function useMiljoegisNoise(propertyId: string, source: NoiseSource, metric: NoiseMetric) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["miljoegis-noise", user?.id, propertyId, source, metric],
    queryFn: ({ signal }) => getMiljoegisNoise(propertyId, source, metric, signal),
    enabled: !!user && !!propertyId,
    staleTime: query => query.state.data?.status === "unavailable" ? 15_000 : 15 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

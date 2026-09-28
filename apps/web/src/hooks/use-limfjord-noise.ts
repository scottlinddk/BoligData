import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { ApiError, getLimfjordNoise } from "@/lib/api";
import type { LimfjordLanguage } from "@shared/types/limfjord-noise";

export function useLimfjordNoise(propertyId: string, language: LimfjordLanguage) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["limfjord-noise", user?.id, propertyId, language],
    queryFn: ({ signal }) => getLimfjordNoise(propertyId, language, signal),
    enabled: !!user && !!propertyId,
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => !(error instanceof ApiError && [400, 401, 404, 429].includes(error.status)) && failureCount < 1,
  });
}

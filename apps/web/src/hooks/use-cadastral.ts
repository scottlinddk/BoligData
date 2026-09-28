import { useQuery } from "@tanstack/react-query";
import type { CadastralReport } from "@shared/types/cadastral";
import { ApiError } from "@/lib/api";
import { useAuth } from "./use-auth";

export function useCadastral(propertyId: string, enabled: boolean) {
  const { user, session } = useAuth();
  return useQuery({
    queryKey: ["cadastral", user?.id, propertyId],
    enabled: enabled && !!user,
    staleTime: 10 * 60_000, gcTime: 10 * 60_000, retry: false,
    queryFn: async ({ signal }): Promise<CadastralReport> => {
      const response = await fetch(`/api/properties?${new URLSearchParams({ id: propertyId, resource: "cadastral" })}`, {
        headers: { Authorization: `Bearer ${session!.access_token}` }, signal, cache: "no-store",
      });
      if (!response.ok) throw new ApiError("Cadastral lookup failed", response.status);
      return response.json() as Promise<CadastralReport>;
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { getResearchHistory } from "@/lib/research-api";

/** The prominent price card and the research workbench share this request. */
export function useListingHistory(propertyId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["research-history", user?.id, propertyId],
    queryFn: () => getResearchHistory(propertyId!),
    enabled: !!user && !!propertyId,
  });
}

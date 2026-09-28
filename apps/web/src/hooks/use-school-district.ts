import { useQuery } from "@tanstack/react-query";
import { getSchoolDistrict } from "@/lib/api";
import { useAuth } from "./use-auth";

export function useSchoolDistrict(propertyId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["school-district", user?.id, propertyId],
    queryFn: () => getSchoolDistrict(propertyId),
    enabled: !!user && !!propertyId,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
}

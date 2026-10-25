import { useQuery } from "@tanstack/react-query";
import type { ParcelMapResponse, ParcelOwnerResponse } from "@shared/types/parcel-map";
import { ApiError } from "@/lib/api";
import { useAuth } from "./use-auth";

function useAuthedFetch() {
  const { session } = useAuth();
  return async <T,>(params: Record<string, string>, signal?: AbortSignal): Promise<T> => {
    const response = await fetch(`/api/properties?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${session!.access_token}` }, signal, cache: "no-store" });
    if (!response.ok) throw new ApiError("Parcel request failed", response.status);
    return response.json() as Promise<T>;
  };
}

/** `bbox` is `minLon,minLat,maxLon,maxLat`, or null while the map is zoomed out too far. */
export function useParcelsInView(bbox: string | null) {
  const { user } = useAuth();
  const get = useAuthedFetch();
  return useQuery({
    queryKey: ["parcels", user?.id, bbox], enabled: !!user && !!bbox, staleTime: 5 * 60_000, retry: false,
    queryFn: ({ signal }) => get<ParcelMapResponse>({ resource: "parcels", bbox: bbox! }, signal),
  });
}

/** Spends one register lookup per BFE and is cached for ten minutes, so re-clicking a parcel is free. */
export function useParcelOwner(bfe: string | null) {
  const { user } = useAuth();
  const get = useAuthedFetch();
  return useQuery({
    queryKey: ["parcel-owner", user?.id, bfe], enabled: !!user && !!bfe, staleTime: 10 * 60_000, gcTime: 10 * 60_000, retry: false,
    queryFn: ({ signal }) => get<ParcelOwnerResponse>({ resource: "parcel-owner", bfe: bfe! }, signal),
  });
}

import { useQuery } from "@tanstack/react-query";
import type { ParcelMapResponse, ParcelOwnerResponse } from "@shared/types/parcel-map";
import { ApiError } from "@/lib/api";
import { useAuth } from "./use-auth";

function useAuthedFetch() {
  const { session } = useAuth();
  return async <T,>(params: Record<string, string>, signal?: AbortSignal, cache: RequestCache = "no-store"): Promise<T> => {
    const response = await fetch(`/api/properties?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${session!.access_token}` }, signal, cache });
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

const OWNER_TTL = 24 * 60 * 60_000;
export const parcelOwnerKey = (userId: string | undefined, bfe: string | null) => ["parcel-owner", userId, bfe] as const;

/**
 * Spends one register lookup per BFE, then is cached for a day: in memory here, and in the browser HTTP cache across
 * reloads (the endpoint sends `private, max-age=86400` for definitive answers), so re-clicking a parcel is free.
 */
export function useParcelOwner(bfe: string | null) {
  const { user } = useAuth();
  const get = useAuthedFetch();
  return useQuery({
    queryKey: parcelOwnerKey(user?.id, bfe), enabled: !!user && !!bfe, staleTime: OWNER_TTL, gcTime: OWNER_TTL, retry: false,
    queryFn: ({ signal }) => get<ParcelOwnerResponse>({ resource: "parcel-owner", bfe: bfe! }, signal, "default"),
  });
}

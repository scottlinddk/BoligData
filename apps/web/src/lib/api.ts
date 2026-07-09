import type {
  ComparablesResponse,
  CreateSearchBody,
  PropertyDetailResponse,
  SearchPropertiesQuery,
  SearchPropertiesResponse,
  UpdateAlertBody,
} from "@shared/types/api";
import type { SavedSearch } from "@shared/types/index";
import { supabase } from "./supabase";

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...headers, ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function searchProperties(query: SearchPropertiesQuery): Promise<SearchPropertiesResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined) params.set(key, String(value));
  }
  return request(`/properties?${params.toString()}`);
}

export function getProperty(id: string): Promise<PropertyDetailResponse> {
  return request(`/properties/${id}`);
}

export function getComparables(id: string): Promise<ComparablesResponse> {
  return request(`/properties/${id}/comparables`);
}

export function listSearches(): Promise<SavedSearch[]> {
  return request(`/searches`);
}

export function createSearch(body: CreateSearchBody): Promise<SavedSearch> {
  return request(`/searches`, { method: "POST", body: JSON.stringify(body) });
}

export function updateAlert(searchId: string, body: UpdateAlertBody): Promise<SavedSearch> {
  return request(`/searches/${searchId}/alerts`, { method: "POST", body: JSON.stringify(body) });
}

import type {
  AdminDashboardResponse,
  AdminUsersResponse,
  AdvisorConnectionsResponse,
  AgentListingsResponse,
  ApproveListingBody,
  ComparablesResponse,
  CreateAdvisorConnectionBody,
  CreateFavoriteBody,
  CreateInvitationBody,
  CreateSearchBody,
  FavoritesResponse,
  InvitationsResponse,
  NotificationsResponse,
  PropertyDetailResponse,
  SearchPropertiesQuery,
  SearchPropertiesResponse,
  UpdateAdminUserBody,
  UpdateAlertBody,
} from "@shared/types/api";
import type { AdminUser, Invitation, Property, SavedSearch } from "@shared/types/index";
import { supabase } from "./supabase";

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...headers, ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.error ?? `Request failed: ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
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
  return request(`/properties?id=${id}`);
}

export function getComparables(id: string): Promise<ComparablesResponse> {
  return request(`/properties?id=${id}&comparables=true`);
}

export function listSearches(): Promise<SavedSearch[]> {
  return request(`/searches`);
}

export function createSearch(body: CreateSearchBody): Promise<SavedSearch> {
  return request(`/searches`, { method: "POST", body: JSON.stringify(body) });
}

export function updateAlert(searchId: string, body: UpdateAlertBody): Promise<SavedSearch> {
  return request(`/searches?id=${searchId}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function listFavorites(): Promise<FavoritesResponse> {
  return request(`/favorites`);
}

export function addFavorite(body: CreateFavoriteBody): Promise<void> {
  return request(`/favorites`, { method: "POST", body: JSON.stringify(body) });
}

export function removeFavorite(propertyId: string): Promise<void> {
  return request(`/favorites?propertyId=${propertyId}`, { method: "DELETE" });
}

export function listNotifications(unreadOnly = false): Promise<NotificationsResponse> {
  return request(`/notifications${unreadOnly ? "?unreadOnly=true" : ""}`);
}

export function markNotificationRead(id: string): Promise<void> {
  return request(`/notifications?id=${id}`, { method: "PATCH" });
}

// --- Admin ---

export function listInvitations(): Promise<InvitationsResponse> {
  return request(`/admin?resource=invitations`);
}

export function createInvitation(body: CreateInvitationBody): Promise<Invitation> {
  return request(`/admin?resource=invitations`, { method: "POST", body: JSON.stringify(body) });
}

export function resendInvitation(id: string): Promise<Invitation> {
  return request(`/admin?resource=invitations&id=${id}`, { method: "POST" });
}

export function revokeInvitation(id: string): Promise<Invitation> {
  return request(`/admin?resource=invitations&id=${id}`, { method: "DELETE" });
}

export function listAdminUsers(): Promise<AdminUsersResponse> {
  return request(`/admin?resource=users`);
}

export function updateAdminUser(id: string, body: UpdateAdminUserBody): Promise<AdminUser> {
  return request(`/admin?resource=users&id=${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function listAdminAdvisorConnections(): Promise<AdvisorConnectionsResponse> {
  return request(`/admin?resource=advisor-connections`);
}

export function createAdvisorConnection(body: CreateAdvisorConnectionBody) {
  return request(`/admin?resource=advisor-connections`, { method: "POST", body: JSON.stringify(body) });
}

export function deleteAdvisorConnection(id: string): Promise<void> {
  return request(`/admin?resource=advisor-connections&id=${id}`, { method: "DELETE" });
}

export function getAdminDashboard(): Promise<AdminDashboardResponse> {
  return request(`/admin?resource=dashboard`);
}

// --- Advisor ---

export function listAdvisorConnections(): Promise<AdvisorConnectionsResponse> {
  return request(`/advisor/connections`);
}

export function listAdvisorFavorites(): Promise<FavoritesResponse> {
  return request(`/advisor/favorites`);
}

export function approveListing(propertyId: string, body: ApproveListingBody) {
  return request(`/listings/${propertyId}/approve`, { method: "POST", body: JSON.stringify(body) });
}

export function unapproveListing(propertyId: string, userId: string): Promise<void> {
  return request(`/listings/${propertyId}/approve?userId=${userId}`, { method: "DELETE" });
}

// --- Agent ---

export function claimListing(propertyId: string): Promise<Property> {
  return request(`/listings/${propertyId}/claim`, { method: "POST" });
}

export function promoteListing(propertyId: string): Promise<Property> {
  return request(`/listings/${propertyId}/promote`, { method: "POST" });
}

export function unpromoteListing(propertyId: string): Promise<Property> {
  return request(`/listings/${propertyId}/promote`, { method: "DELETE" });
}

export function listAgentListings(): Promise<AgentListingsResponse> {
  return request(`/agent/listings`);
}

import type {
  AdminUser,
  AdvisorConnection,
  AlertFrequency,
  FavoriteProperty,
  Invitation,
  ListingApproval,
  Notification,
  Property,
  PropertyFilters,
  PropertySummary,
  SortDirection,
  SortField,
  UserRole,
} from "./index.js";

export type { SortDirection, SortField };

export interface SearchPropertiesQuery extends Partial<PropertyFilters> {
  sortField?: SortField;
  sortDirection?: SortDirection;
  limit?: number;
  offset?: number;
  /** ISO timestamp; only match listings created after this (used by the notification cron). */
  createdAfter?: string;
}

export interface SearchPropertiesResponse {
  /** Whether the request carried a valid session — determines which of the two arrays below is populated. */
  authenticated: boolean;
  /** Full listing data. Populated only when authenticated is true. */
  properties: Property[];
  /** Address-only listing data. Populated only when authenticated is false. */
  summaries: PropertySummary[];
  total: number;
  limit: number;
  offset: number;
  page: number;
  totalPages: number;
}

export interface PropertyDetailResponse {
  property: Property;
  enrichment: import("./index.js").Enrichment | null;
}

export interface ComparableEntry {
  property: Property;
  soldDate: string;
  price: number;
  pricePerSqm: number;
  distanceMeters: number;
}

export interface ComparablesResponse {
  comparables: ComparableEntry[];
  neighborhoodAvgPricePerSqm: number | null;
}

export interface CreateSearchBody {
  name: string;
  filters: PropertyFilters;
  alertFrequency: AlertFrequency;
}

export interface UpdateAlertBody {
  alertFrequency: AlertFrequency;
}

export interface ApiErrorResponse {
  error: string;
}

export interface CreateInvitationBody {
  email: string;
  role: UserRole;
}

export interface InvitationsResponse {
  invitations: Invitation[];
}

export interface AdminUsersResponse {
  users: AdminUser[];
}

export interface UpdateAdminUserBody {
  role?: UserRole;
  organizationName?: string | null;
}

export interface CreateAdvisorConnectionBody {
  advisorId: string;
  userId: string;
}

export interface AdvisorConnectionsResponse {
  connections: AdvisorConnection[];
}

/**
 * One connection from the caller's own point of view, with the other
 * party's contact info resolved (email lives in auth.users, which callers
 * can't read directly). "professional" means the caller is the customer and
 * the other party is their advisor/agent; "client" means the caller is the
 * advisor/agent and the other party is one of their connected customers.
 */
export interface MyConnection {
  id: string;
  direction: "professional" | "client";
  otherUserId: string;
  otherUserEmail: string;
  otherUserRole: UserRole;
  otherUserOrganizationName: string | null;
  createdAt: string;
}

export interface MyConnectionsResponse {
  connections: MyConnection[];
}

export interface AdminDashboardResponse {
  pendingInvitations: number;
  usersByRole: Record<UserRole, number>;
  promotedListings: number;
  recentApprovals: number;
}

export interface FavoritesResponse {
  favorites: FavoriteProperty[];
  properties: Property[];
}

export interface CreateFavoriteBody {
  propertyId: string;
}

export interface ApproveListingBody {
  userId: string;
  note?: string;
}

export interface ListingApprovalsResponse {
  approvals: ListingApproval[];
}

export interface NotificationsResponse {
  notifications: Notification[];
}

export interface AgentListingsResponse {
  properties: Property[];
}

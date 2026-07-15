import type {
  AdminUser,
  AdvisorConnection,
  AlertFrequency,
  AppSettings,
  BestTimeToContact,
  ContactPreference,
  ConversationWithContext,
  FavoriteProperty,
  Invitation,
  LeadRouting,
  ListingApproval,
  ListingRecommendation,
  Message,
  Notification,
  NotificationChannels,
  NotificationType,
  Property,
  PropertyFilters,
  PropertySummary,
  RecommendationStatus,
  SortDirection,
  SortField,
  UserProfile,
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

export interface NotificationsQuery {
  unreadOnly?: boolean;
  type?: NotificationType;
}

export interface NotificationsResponse {
  notifications: Notification[];
}

// --- Messages ---

export interface ConversationsResponse {
  conversations: ConversationWithContext[];
}

export interface MessagesResponse {
  messages: Message[];
}

export interface SendMessageBody {
  body: string;
}

export interface CreateConversationBody {
  /** The connected professional (agent/advisor) to start a thread with. */
  otherUserId: string;
  propertyId?: string | null;
}

// --- Profile ---

export interface ProfileResponse {
  profile: UserProfile;
  email: string;
}

export interface UpdateProfileBody {
  fullName?: string | null;
  phone?: string | null;
  contactPref?: ContactPreference;
  bestTime?: BestTimeToContact;
  notificationChannels?: NotificationChannels;
  licenseNumber?: string | null;
  leadRouting?: LeadRouting;
  notifyNewLead?: boolean;
}

// --- Admin: app settings & agents ---

export interface AppSettingsResponse {
  settings: AppSettings;
}

export interface UpdateAppSettingsBody {
  broadcastEnabled: boolean;
}

export interface RegisteredAgent {
  id: string;
  organizationName: string | null;
  email: string;
}

export interface RegisteredAgentsResponse {
  agents: RegisteredAgent[];
}

export interface AgentListingsResponse {
  properties: Property[];
}

export interface CreateRecommendationsBody {
  propertyIds: string[];
  userIds: string[];
  message?: string;
}

export interface RespondRecommendationBody {
  status: Extract<RecommendationStatus, "accepted" | "dismissed">;
  responseMessage?: string;
}

export interface RecommendationsResponse {
  recommendations: ListingRecommendation[];
  properties: Property[];
}

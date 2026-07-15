import type {
  AdminUser,
  AdvisorConnection,
  BbrData,
  Conversation,
  Enrichment,
  FavoriteProperty,
  Invitation,
  ListingApproval,
  ListingRecommendation,
  Message,
  Notification,
  Property,
  PropertySummary,
  RiskFlags,
  SavedSearch,
  UserProfile,
} from "../../../../packages/shared/src/types/index.js";

export function rowToPropertySummary(row: Record<string, any>): PropertySummary {
  return { id: row.id, address: row.address };
}

/** `bbrData`/`riskFlags` are looked up separately (enrichments table, batch-fetched by the caller) and attached here — null when not supplied or not yet enriched. */
export function rowToProperty(
  row: Record<string, any>,
  bbrData: BbrData | null = null,
  riskFlags: RiskFlags | null = null,
): Property {
  return {
    id: row.id,
    address: row.address,
    municipality: row.municipality,
    postalCode: row.postal_code,
    price: Number(row.price),
    sqm: Number(row.sqm),
    listingDate: row.listing_date,
    listingSource: row.listing_source,
    externalId: row.external_id,
    lat: Number(row.lat),
    lon: Number(row.lon),
    status: row.status,
    buildingYear: row.building_year,
    propertyType: row.property_type,
    rooms: row.rooms,
    images: row.images ?? [],
    description: row.description,
    agentName: row.agent_name,
    agentUserId: row.agent_user_id ?? null,
    isPromoted: row.is_promoted ?? false,
    promotedAt: row.promoted_at ?? null,
    promotedBy: row.promoted_by ?? null,
    idLokalid: row.id_lokalid ?? null,
    matrikelnr: row.matrikelnr ?? null,
    ejerlav: row.ejerlav ?? null,
    zone: row.zone ?? null,
    registeredAreaSqm: row.registered_area_sqm !== null && row.registered_area_sqm !== undefined ? Number(row.registered_area_sqm) : null,
    bbrData,
    riskFlags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToEnrichment(row: Record<string, any>): Enrichment {
  return {
    id: row.id,
    propertyId: row.property_id,
    bbrData: row.bbr_data,
    soldPriceHistory: row.sold_price_history ?? [],
    calculatedMetrics: row.calculated_metrics,
    riskFlags: row.risk_flags,
    schoolTransport: row.school_transport,
    publicValuation: row.public_valuation ?? null,
    source: row.source,
    enrichedAt: row.enriched_at,
  };
}

export function rowToSearch(row: Record<string, any>): SavedSearch {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    filters: row.filters,
    alertFrequency: row.alert_frequency,
    createdAt: row.created_at,
    lastAlertAt: row.last_alert_at,
  };
}

export function rowToInvitation(row: Record<string, any>): Invitation {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by,
    status: row.status,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
  };
}

/** Expects a user_profiles row with an `email` field joined in from auth.users. */
export function rowToAdminUser(row: Record<string, any>): AdminUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    organizationName: row.organization_name,
    createdAt: row.created_at,
    inviteAccepted: row.email_confirmed_at != null,
  };
}

export function rowToFavorite(row: Record<string, any>): FavoriteProperty {
  return {
    id: row.id,
    userId: row.user_id,
    propertyId: row.property_id,
    createdAt: row.created_at,
  };
}

export function rowToAdvisorConnection(row: Record<string, any>): AdvisorConnection {
  return {
    id: row.id,
    advisorId: row.advisor_id,
    userId: row.user_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

export function rowToListingApproval(row: Record<string, any>): ListingApproval {
  return {
    id: row.id,
    propertyId: row.property_id,
    advisorId: row.advisor_id,
    userId: row.user_id,
    note: row.note,
    createdAt: row.created_at,
  };
}

export function rowToListingRecommendation(row: Record<string, any>): ListingRecommendation {
  return {
    id: row.id,
    batchId: row.batch_id,
    propertyId: row.property_id,
    advisorId: row.advisor_id,
    userId: row.user_id,
    message: row.message,
    status: row.status,
    responseMessage: row.response_message,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  };
}

export function rowToNotification(row: Record<string, any>): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    searchId: row.search_id,
    propertyId: row.property_id,
    alertId: row.alert_id,
    conversationId: row.conversation_id,
    title: row.title,
    body: row.body,
    linkPath: row.link_path,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export function rowToConversation(row: Record<string, any>): Conversation {
  return {
    id: row.id,
    propertyId: row.property_id,
    advisorId: row.advisor_id,
    userId: row.user_id,
    createdAt: row.created_at,
    advisorLastReadAt: row.advisor_last_read_at,
    userLastReadAt: row.user_last_read_at,
  };
}

export function rowToMessage(row: Record<string, any>): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

/** Expects a user_profiles row (snake_case columns) — email is resolved separately from auth.users. */
export function rowToProfile(row: Record<string, any>): UserProfile {
  return {
    id: row.id,
    role: row.role,
    organizationName: row.organization_name,
    createdAt: row.created_at,
    fullName: row.full_name,
    phone: row.phone,
    contactPref: row.contact_pref,
    bestTime: row.best_time,
    notificationChannels: row.notification_channels,
    licenseNumber: row.license_number,
    leadRouting: row.lead_routing,
    notifyNewLead: row.notify_new_lead,
  };
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

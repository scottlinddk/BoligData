import type {
  Enrichment,
  Property,
  SavedSearch,
} from "../../../../packages/shared/src/types/index.js";

export function rowToProperty(row: Record<string, any>): Property {
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
    imageUrls: row.image_urls ?? [],
    description: row.description,
    agentName: row.agent_name,
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

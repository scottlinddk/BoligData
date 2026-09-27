import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RawListing } from "./types.js";
import { asIsoDate, listingContentHash } from "./map-utils.js";

export interface PreviousListingObservation {
  price: number;
  status: string;
  last_seen_at: string | null;
  listing_date?: string | null;
  current_episode_key?: string | null;
}

type HistoryRow = Record<string, unknown>;
const key = (...parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");

function conflictingSaleEvidence(existing: HistoryRow, incoming: HistoryRow): boolean {
  for (const field of ["residential_area", "first_asking_price", "last_asking_price", "latest_episode_days", "documented_active_days", "calendar_days"]) {
    if (existing[field] != null && incoming[field] != null && Number(existing[field]) !== Number(incoming[field])) return true;
  }
  if (existing.area_definition && incoming.area_definition && existing.area_definition !== "unknown" && incoming.area_definition !== "unknown" && existing.area_definition !== incoming.area_definition) return true;
  return existing.area_as_of != null && incoming.area_as_of != null && existing.area_as_of !== incoming.area_as_of;
}

/** The database also deduplicates a documented trade by property/date/price/
 * type, independently of registration ID. An upstream ID can change or first
 * appear later. Keep every source observation, but reuse an exactly equivalent
 * normalized trade rather than treating that secondary constraint as failure.
 * A different property, scope, price/type or provenance is never equivalent. */
async function persistSaleTransactions(client: SupabaseClient, transactions: HistoryRow[]): Promise<string[]> {
  const write = (values: HistoryRow[]) => client.from("sale_transactions")
    .upsert(values, { onConflict: "ingest_key", ignoreDuplicates: true });
  const { error } = await write(transactions);
  if (!error) return [];
  if (error.code !== "23505") return [`sale_transactions: ${error.message}`];

  // A failed INSERT statement is atomic. Retry each member so one alternate
  // registration identity cannot prevent unrelated valid trades from saving.
  const errors: string[] = [];
  for (const transaction of transactions) {
    const retry = await write([transaction]);
    if (!retry.error) continue;
    if (retry.error.code !== "23505") {
      errors.push(`sale_transactions: ${retry.error.message}`);
      continue;
    }
    let match = client.from("sale_transactions").select("id,residential_area,area_definition,area_as_of,first_asking_price,last_asking_price,latest_episode_days,documented_active_days,calendar_days")
      .eq("property_id", transaction.property_id)
      .eq("sold_date", transaction.sold_date)
      .eq("date_precision", transaction.date_precision)
      .eq("sale_price", transaction.sale_price)
      .eq("sale_type", transaction.sale_type)
      .eq("data_mode", transaction.data_mode);
    match = transaction.owner_id == null ? match.is("owner_id", null) : match.eq("owner_id", transaction.owner_id);
    const existing = await match.limit(1).maybeSingle();
    if (existing.error || !existing.data) {
      // Do not ignore arbitrary 23505 failures, and never let a mock/legacy or
      // privately imported row stand in for newly observed public real data.
      errors.push(`sale_transactions: ${existing.error?.message ?? retry.error.message}`);
    } else if (conflictingSaleEvidence(existing.data, transaction)) {
      errors.push("sale_transactions: conflicting area, asking price or duration evidence for an existing trade");
    }
  }
  return errors;
}

/** A sale registration is independent of the current listing campaign. Do not
 * attach past sales to the current asking price, room count or description. */
export function buildHistoryRows(
  listing: RawListing,
  propertyId: string,
  observedAt: string,
  previous: PreviousListingObservation | null = null,
) {
  const dataMode = listing.data_mode ?? "unknown";
  const identity = [listing.listing_source, listing.external_id, dataMode];
  const common = {
    property_id: propertyId, owner_id: null, source: listing.listing_source,
    source_url: listing.listing_url, observed_at: observedAt, data_mode: dataMode,
  };
  const today = observedAt.slice(0, 10);
  const listingDate = listing.listing_date && listing.listing_date <= today ? asIsoDate(listing.listing_date) : null;
  const relisted = previous !== null && ["withdrawn", "sold"].includes(previous.status) && listing.status === "active";
  const newSourceStart = previous?.listing_date != null && listingDate !== null && previous.listing_date !== listingDate;
  const newEpisode = relisted || newSourceStart;
  const episodeKey = newEpisode
    ? `${relisted && !newSourceStart ? "unknown:" : ""}${key("episode", ...identity, observedAt)}`
    : previous?.current_episode_key ?? key("episode", ...identity, listingDate);
  const campaign = {
    property_id: propertyId, owner_id: null, source: listing.listing_source,
    source_url: listing.listing_url, observed_at: observedAt,
    ingest_key: key("campaign", ...identity),
    link_reason: "Same source listing identifier; no cross-source or property-unit inference",
  };
  const episode = {
    ...common, ingest_key: episodeKey, source_listing_id: listing.external_id,
    // A relist observed after a removal does not document the exact restart
    // day. Its stable key preserves that unknown on retries and later crawls.
    start_date: episodeKey.startsWith("unknown:") ? null : listingDate,
    date_precision: episodeKey.startsWith("unknown:") ? "unknown" : listingDate ? "day" : "unknown",
    status: listing.status === "withdrawn" ? "removed" : listing.status, agent_name: listing.agent_name,
  };
  const snapshotKey = key("snapshot", ...identity, listingContentHash(listing));
  const events: HistoryRow[] = [{
    ...common, ingest_key: key(snapshotKey, "observation"), event_type: "observation",
    event_date: today, date_precision: "day", price: listing.price,
  }];
  if (listingDate) {
    events.push({ ...common, ingest_key: key("first_listing", ...identity, listingDate),
      event_type: "first_listing", event_date: listingDate, date_precision: "day",
      // Today's price is not evidence of the asking price on the first day.
      price: null });
  }
  if (previous && previous.price !== listing.price) {
    const from = previous.last_seen_at?.slice(0, 10) ?? null;
    events.push({ ...common, ingest_key: key("price_change", ...identity, previous.price, listing.price, previous.last_seen_at),
      event_type: "price_change", event_date: from, event_date_end: today,
      date_precision: from ? "interval" : "unknown", price: listing.price });
  }
  if (previous && previous.status !== listing.status) {
    const eventType = listing.status === "withdrawn" ? "removed" : listing.status === "sold" ? "sold" : "relisted";
    events.push({ ...common, ingest_key: key("status", ...identity, previous.status, listing.status, previous.last_seen_at),
      event_type: eventType, event_date: previous.last_seen_at?.slice(0, 10) ?? null,
      event_date_end: today, date_precision: previous.last_seen_at ? "interval" : "unknown", price: null });
  }

  const observations: HistoryRow[] = Object.entries({
    asking_price: listing.price, advertised_residential_area: listing.sqm,
    advertised_rooms: listing.rooms, property_type: listing.property_type,
    source_listing_date: listing.listing_date, listing_status: listing.status,
    agent_name: listing.agent_name, listing_description: listing.description,
  }).map(([field, value]) => ({
    ...common, ingest_key: key(snapshotKey, field), field_name: field, value: value ?? { status: "unknown" },
    effective_date: field === "source_listing_date" ? listingDate : null,
    date_precision: field === "source_listing_date" && listingDate ? "day" : "unknown",
    method: "source_listing_v2", verification_status: "unverified", source_version: "crawl-v2",
  }));

  if (listing.reported_time_on_market) {
    observations.push({
      ...common, ingest_key: key(snapshotKey, "reported_time_on_market", today),
      field_name: "reported_time_on_market", value: listing.reported_time_on_market,
      effective_date: today, date_precision: "day", method: "source_reported_duration",
      verification_status: "unverified", source_version: "crawl-v2",
    });
  }

  const transactions: HistoryRow[] = [];
  let quarantinedSales = 0;
  for (const sale of listing.sold_price_history ?? []) {
    const validDate = asIsoDate(sale.soldDate);
    const valid = validDate !== null && validDate <= today && Number.isFinite(sale.price) && sale.price > 0;
    const saleKey = sale.registrationId
      ? key("registration", listing.listing_source, dataMode, sale.registrationId)
      : key("sale", propertyId, dataMode, sale.soldDate, sale.price, sale.saleType ?? "unknown");
    observations.push({
      ...common, ingest_key: key(saleKey, JSON.stringify(sale)), field_name: "sale_registration", value: sale,
      effective_date: valid ? validDate : null, date_precision: valid ? "day" : "unknown",
      method: "source_registration_v2", verification_status: valid ? "unverified" : "conflict",
      source_version: "crawl-v2", conflict_group: valid ? null : "invalid_or_future_sale",
    });
    if (!valid) { quarantinedSales += 1; continue; }
    transactions.push({
      ...common, ingest_key: saleKey, registration_id: sale.registrationId ?? null,
      sold_date: validDate, date_precision: "day", sale_price: sale.price,
      sale_type: sale.saleType ?? "unknown",
      residential_area: sale.areaDefinition === "residential" ? sale.residentialArea ?? null : null,
      area_definition: sale.areaDefinition ?? "unknown",
      // Neither the current listing area nor today's price belongs to a past sale.
      area_as_of: sale.areaDefinition === "residential" ? validDate : null,
    });
  }
  return { campaign, episode, events, observations, transactions, quarantinedSales,
    previousEpisodeToClose: newSourceStart && previous?.current_episode_key ? previous.current_episode_key : null };
}

/** Idempotent writes preserve original observations across repeated crawls.
 * Ingestion errors remain visible to the caller; no history is guessed. */
export async function persistHistoryRows(client: SupabaseClient, rows: ReturnType<typeof buildHistoryRows>): Promise<string[]> {
  const errors: string[] = [];
  const { data: campaign, error: campaignError } = await client.from("listing_campaigns")
    .upsert([rows.campaign], { onConflict: "ingest_key" }).select("id").single();
  if (campaignError || !campaign) return [`listing_campaigns: ${campaignError?.message ?? "missing campaign identity"}`];
  const { data: episode, error: episodeError } = await client.from("listing_episodes")
    .upsert([{ ...rows.episode, campaign_id: campaign.id }], { onConflict: "ingest_key" }).select("id").single();
  if (episodeError || !episode) return [`listing_episodes: ${episodeError?.message ?? "missing episode identity"}`];
  if (rows.previousEpisodeToClose) {
    const { error } = await client.from("listing_episodes").update({ status: "unknown" }).eq("ingest_key", rows.previousEpisodeToClose);
    if (error) errors.push(`listing_episodes: ${error.message}`);
  }
  const batches: [string, HistoryRow[], boolean][] = [
    ["listing_events", rows.events.map((event) => ({ ...event, campaign_id: campaign.id, episode_id: episode.id })), true],
    ["source_observations", rows.observations.map((observation) => ({ ...observation,
      // A past sale registration is not evidence about this listing episode.
      episode_id: observation.field_name === "sale_registration" ? null : episode.id,
    })), true],
    ["sale_transactions", rows.transactions, true],
  ];
  for (const [table, values, ignoreDuplicates] of batches) {
    if (values.length === 0) continue;
    // Duplicate registrations in one payload must not trigger Postgres 21000.
    const unique = [...new Map(values.map((row) => [row.ingest_key, row])).values()];
    if (table === "sale_transactions") {
      errors.push(...await persistSaleTransactions(client, unique));
      continue;
    }
    const { error } = await client.from(table).upsert(unique, { onConflict: "ingest_key", ignoreDuplicates });
    if (error) errors.push(`${table}: ${error.message}`);
  }
  return errors;
}

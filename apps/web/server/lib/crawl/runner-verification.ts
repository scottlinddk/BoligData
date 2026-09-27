import type { SupabaseClient } from "@supabase/supabase-js";

const TARGET_ID = "9dfbb273-37da-4e21-b8c7-f482d2aae19d";
const PUBLIC_COLUMNS = "id,address,listing_source,external_id,data_mode,listing_date,listing_date_definition,price,sqm,status,last_seen_at";
const GROUPS = ["sales", "bbr", "valuation", "soil_type", "soil_contamination", "noise"];

/** Whitelist source metadata, never raw payloads, errors, credentials or owner IDs. */
export function verificationSourceGroups(value: unknown) {
  const groups = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  return Object.fromEntries(GROUPS.map((name) => {
    const raw = groups[name];
    const row = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
    return [name, {
      dataMode: ["real", "mock", "unavailable"].includes(String(row.dataMode)) ? row.dataMode : "unknown",
      verificationStatus: ["verified", "unverified", "unavailable"].includes(String(row.verificationStatus)) ? row.verificationStatus : "unknown",
      observedAt: typeof row.observedAt === "string" && /^\d{4}-\d\d-\d\dT/.test(row.observedAt) && Number.isFinite(Date.parse(row.observedAt)) ? row.observedAt : null,
    }];
  }));
}

/** SELECT-only production diagnosis, including the reported listing. Shared
 * normalized rows only: user-imported evidence and ownership are excluded. */
export async function verifyCrawlData(client: SupabaseClient) {
  const checks = [
    ["realProperties", "properties", "data_mode", "real"],
    ["unknownProperties", "properties", "data_mode", "unknown"],
    ["realSaleTransactions", "sale_transactions", "data_mode", "real"],
    ["realListingEvents", "listing_events", "data_mode", "real"],
    ["liveBbrEnrichments", "enrichments", "source_status->bbr->>dataMode", "real"],
  ] as const;
  const counts: Record<string, number | null> = {};
  for (const [name, table, field, value] of checks) {
    let query = client.from(table).select("id", { count: "exact", head: true }).eq(field, value);
    if (table === "sale_transactions" || table === "listing_events") query = query.is("owner_id", null);
    const { count, error } = await query;
    if (error) throw new Error(`Verification read failed for ${table}`);
    counts[name] = count;
  }
  const target = await client.from("properties").select(PUBLIC_COLUMNS).eq("id", TARGET_ID).maybeSingle();
  if (target.error) throw new Error("Verification read failed for target property");
  const others = await client.from("properties").select(PUBLIC_COLUMNS).eq("status", "active").neq("id", TARGET_ID).order("address").limit(target.data ? 2 : 3);
  if (others.error) throw new Error("Verification read failed for sample properties");
  const samples = [];
  for (const property of [...(target.data ? [target.data] : []), ...(others.data ?? [])]) {
    const sales = await client.from("sale_transactions").select("id", { count: "exact", head: true }).eq("property_id", property.id).eq("data_mode", "real").is("owner_id", null);
    const enrichment = await client.from("enrichments").select("source_status,enriched_at").eq("property_id", property.id).maybeSingle();
    const durations = await client.from("source_observations").select("observed_at,value,listing_episodes!inner(source_listing_id,status)")
      .eq("property_id", property.id).eq("source", property.listing_source).eq("data_mode", "real").is("owner_id", null)
      .eq("field_name", "reported_time_on_market").eq("method", "source_reported_duration")
      .eq("listing_episodes.source_listing_id", property.external_id).eq("listing_episodes.status", "active")
      .order("observed_at", { ascending: false }).limit(1);
    if (sales.error || enrichment.error || durations.error) throw new Error("Verification read failed for sample evidence");
    const duration = durations.data?.[0];
    const days = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 36_500 ? value : null;
    const reportedTimeOnMarket = duration ? { observedAt: duration.observed_at, latestEpisodeDays: days(duration.value?.latestEpisodeDays), totalDays: days(duration.value?.totalDays) } : null;
    samples.push({ ...property, ownRealTransactionCount: sales.count, enrichedAt: enrichment.data?.enriched_at ?? null, reportedTimeOnMarket, sourceGroups: verificationSourceGroups(enrichment.data?.source_status) });
  }
  return { counts, targetFound: Boolean(target.data), samples };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchMarketSales, type MarketSubject } from "../research/market-source.js";
import { estimateResearchPrice } from "../../../../../packages/shared/src/analysis/valuation.js";
import { transactionFromRow } from "../research/handlers.js";

const TARGET_ID = "9dfbb273-37da-4e21-b8c7-f482d2aae19d";
const PUBLIC_COLUMNS = "id,address,municipality,postal_code,property_type,lat,lon,listing_source,external_id,data_mode,listing_date,listing_date_definition,price,sqm,status,last_seen_at";
const GROUPS = ["sales", "bbr", "valuation", "soil_type", "soil_contamination", "noise"];

/** Whitelist source metadata, never raw payloads, errors, credentials or owner IDs. */
export function verificationSourceGroups(value: unknown) {
  // These categories describe known source failures. Never pass through any
  // part of the reason: upstream errors can contain URLs or credentials.
  function diagnostic(reason: unknown) {
    const message = typeof reason === "string" ? reason.slice(0, 2_000) : "";
    if (/^(?:DATAFORDELER_API_KEY|STOEJKORT_TYPENAME) not configured\b/.test(message)) return "missing_configuration";
    if (/^(?:no id_lokalid to look up|invalid DAR husnummer UUID|no BFE number or matrikelnr\/ejerlav to look up|no matrikelnr\/ejerlav to look up|no usable coordinates)\b/.test(message)) return "address_identity_missing";
    if (/^(?:no current built BBR building linked|multiple BBR building records linked|BBR response does not establish a complete building result|BBR response has missing or mismatched building identity|BBR building record is not current and built|no BBR building linked to husnummer)\b/.test(message)) return "no_unique_current_building";
    // HttpError prefixes and the BBR retry wrapper are generated locally.
    if (/(?:^|\(extended field set also failed: )HTTP 401 from\b/.test(message)) return "http_401";
    if (/(?:^|\(extended field set also failed: )HTTP 403 from\b/.test(message)) return "http_403";
    if (/^(?:BBR schema is missing required |VUR_Ejendomsvurdering is not in the VUR schema|no assessed-value field on VUR_Ejendomsvurdering|Unknown field\b|Unknown argument\b|Cannot query field\b)/i.test(message) ||
        /\b(?:field|argument)\s+[`'"][^`'"]+[`'"]\s+does not exist\b/i.test(message)) return "schema_rejected";
    return "lookup_failed";
  }
  const groups = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  return Object.fromEntries(GROUPS.map((name) => {
    const raw = groups[name];
    const row = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
    const dataMode = typeof row.dataMode === "string" && ["real", "mock", "unavailable"].includes(row.dataMode) ? row.dataMode : "unknown";
    return [name, {
      dataMode,
      verificationStatus: typeof row.verificationStatus === "string" && ["verified", "unverified", "unavailable"].includes(row.verificationStatus) ? row.verificationStatus : "unknown",
      observedAt: typeof row.observedAt === "string" && /^\d{4}-\d\d-\d\dT/.test(row.observedAt) && Number.isFinite(Date.parse(row.observedAt)) ? row.observedAt : null,
      diagnosticCode: dataMode === "unavailable" ? diagnostic(row.reason) : null,
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
  let targetMarket = null;
  if (target.data?.data_mode === "real") {
    const now = new Date().toISOString();
    const from = `${Number(now.slice(0, 4)) - 2}${now.slice(4, 10)}`;
    const live = await fetchMarketSales(target.data as MarketSubject, from);
    const stored = await client.from("sale_transactions")
      .select("id,property_id,sold_date,date_precision,sale_price,sale_type,residential_area,area_definition,area_as_of,observed_at,data_mode,source,properties!inner(address,municipality,postal_code,property_type,lat,lon)")
      .is("owner_id", null).eq("data_mode", "real").eq("properties.municipality", target.data.municipality).eq("properties.property_type", target.data.property_type)
      .gte("sold_date", from).lte("sold_date", now.slice(0, 10)).order("sold_date", { ascending: false }).limit(2000);
    if (stored.error) throw new Error("Verification read failed for stored comparison sales");
    const transactions = live.transactions.length ? live.transactions : (stored.data ?? []).map(row => transactionFromRow(row));
    const reference = estimateResearchPrice({ subject: { propertyId: target.data.id, propertyType: target.data.property_type, municipality: target.data.municipality, residentialArea: target.data.sqm, areaEvidence: "reported", dataMode: "live", firstAsking: null, firstAskingDocumented: false, daysOnMarket: null, timeDefinition: "latest_episode_days" }, transactions, dataVersion: "verification", calculatedAt: now, partialDataset: live.truncated });
    targetMarket = { sourceStatus: live.status, sourceFailure: live.failure ?? null, population: live.transactions.length ? "registered_postal_sales" : "stored_listing_sales", transactions: transactions.length, eligibleSales: reference.baseline.count, baselinePrice: reference.baseline.median, truncated: live.truncated };
  }
  return { counts, targetFound: Boolean(target.data), samples, targetMarket };
}

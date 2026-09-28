import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "../http-helpers.js";
import { mapConcurrent } from "./concurrency.js";
import { fetchBoligsidenOriginalAsking } from "./boligsiden-original-price.js";

export interface OriginalPriceBackfillOptions {
  dryRun: boolean;
  afterId: string | null;
  batchSize: number;
}

type PropertyRow = {
  id: string; listing_source: string; external_id: string; status: string;
  data_mode: string; listing_url: string | null; address: string; postal_code: string | null; price: number;
  current_episode_key: string | null; listing_date: string | null; listing_date_definition: string;
};
type EvidenceRow = { id: string; ingest_key?: string; campaign_id?: string | null; source: string; status?: string; data_mode?: string; start_date?: string | null; end_date?: string | null };
type Outcome = "unsupported_source" | "nonlive_data" | "invalid_source_identity" | "missing" | "unavailable" | "conflict" | "not_current"
  | "ambiguous_episode" | "would_persist" | "persisted" | "already_present" | "read_failed" | "write_failed";
export interface OriginalPriceBackfillRow {
  id: string; source: string; status: string; dataMode: string; outcome: Outcome;
  sourceListingId: string; address: string; postalCode: string | null; listingUrl: string | null; currentAsking: number | null;
  sourceAddressId?: string | null; sourceUrl?: string | null; timelineUrl?: string | null;
  originalPrice?: number; originalDate?: string | null; reason?: string;
}

const key = (...parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const COLUMNS = "id,listing_source,external_id,status,data_mode,listing_url,address,postal_code,price,current_episode_key,listing_date,listing_date_definition";

/** Enumerates stored IDs, including unsupported/legacy rows. Only source-backed
 * evidence and any missing source identity links are written; never properties,
 * asking prices, enrichments, or other observations. Dry runs make SELECTs only. */
export async function runOriginalPriceBackfill(client: SupabaseClient, options: OriginalPriceBackfillOptions) {
  if (typeof options.dryRun !== "boolean" || !Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 8 ||
      (options.afterId !== null && !isUuid(options.afterId))) throw new Error("Invalid original-price batch options");
  const afterId = options.afterId?.toLowerCase() ?? null;
  let page = client.from("properties").select(COLUMNS).order("id", { ascending: true });
  if (afterId !== null) page = page.gt("id", afterId);
  const [countResult, pageResult] = await Promise.all([
    client.from("properties").select("id", { count: "exact", head: true }),
    page.limit(options.batchSize + 1),
  ]);
  if (countResult.error || pageResult.error || typeof countResult.count !== "number") throw new Error("Could not enumerate stored listings");
  const rows = (pageResult.data ?? []) as PropertyRow[];
  const selected = rows.slice(0, options.batchSize);
  const observedAt = new Date().toISOString();
  const results = await mapConcurrent(selected, 4, async (property): Promise<OriginalPriceBackfillRow> => {
    let sourceDetails: Partial<OriginalPriceBackfillRow> = {};
    const result = (outcome: Outcome, details: Partial<OriginalPriceBackfillRow> = {}): OriginalPriceBackfillRow =>
      ({ id: property.id, source: property.listing_source, status: property.status, dataMode: property.data_mode, outcome,
        sourceListingId: property.external_id, address: property.address, postalCode: property.postal_code, listingUrl: property.listing_url,
        currentAsking: Number.isFinite(Number(property.price)) ? Number(property.price) : null, ...sourceDetails, ...details });
    if (property.listing_source !== "boligsiden") return result("unsupported_source");
    if (["mock", "demo"].includes(property.data_mode)) return result("nonlive_data");
    if (!isUuid(property.external_id)) return result("invalid_source_identity");

    // These identities came from the source case feed, not DAR/access-address
    // identifiers. They only shortcut discovery; the live source must still
    // corroborate the case and opening before any original can be persisted.
    let addressId: string | undefined;
    try {
      const identities = await client.from("source_observations").select("value,conflict_group", { count: "exact" })
        .eq("property_id", property.id).eq("source", "boligsiden").eq("field_name", "source_address_id")
        .eq("method", "source_listing_identity").eq("data_mode", "real").eq("verification_status", "verified")
        .is("owner_id", null).limit(101);
      if (identities.error || typeof identities.count !== "number") return result("read_failed", { reason: "source_identity_read_failed" });
      if (identities.count <= 100) {
        const matching = (identities.data ?? []).filter(row => typeof row.value?.sourceListingId === "string" &&
          row.value.sourceListingId.toLowerCase() === property.external_id.toLowerCase());
        if (matching.length > 0 && matching.every(row => !row.conflict_group && isUuid(row.value?.addressId))) {
          const addresses = new Set<string>(matching.map(row => row.value.addressId.toLowerCase()));
          if (addresses.size === 1) addressId = addresses.values().next().value;
        }
      }
    } catch { return result("read_failed", { reason: "source_identity_read_failed" }); }

    if (addressId) sourceDetails = { sourceAddressId: addressId };
    let source: Awaited<ReturnType<typeof fetchBoligsidenOriginalAsking>>;
    try {
      source = await fetchBoligsidenOriginalAsking({ sourceListingId: property.external_id, listingUrl: property.listing_url,
        postalCode: property.postal_code, status: property.status, currentAsking: Number(property.price), observedAt,
        ...(addressId ? { addressId } : {}) });
    } catch { return result("unavailable", { reason: "source_request_failed" }); }
    sourceDetails = { sourceAddressId: source.sourceAddressId ?? addressId ?? null, sourceUrl: source.sourceUrl ?? null, timelineUrl: source.timelineUrl ?? null };
    const reason = typeof source.reason === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(source.reason) ? source.reason : undefined;
    if (source.status !== "exact") return result(source.status, reason ? { reason } : {});
    if (!source.identityConfirmed || source.listingStatus !== "active" || source.sourceListingId.toLowerCase() !== property.external_id.toLowerCase() || source.scope !== "listing" ||
        source.price === null || !Number.isFinite(source.price) || source.price <= 0) return result("conflict");
    const details = { originalPrice: source.price, originalDate: source.originalDate };

    // A successful resolver binds an exact original to this source case. Never
    // create links from an unconfirmed address match or a missing/blocked source.
    const [episodeResult, evidenceResult] = await Promise.all([
      client.from("listing_episodes").select("id,campaign_id,source,status,data_mode,ingest_key,start_date,end_date")
        .eq("property_id", property.id).eq("source", "boligsiden").eq("source_listing_id", property.external_id).is("owner_id", null),
      client.from("source_observations").select("id,ingest_key,value,episode_id,verification_status,conflict_group,observed_at,effective_date,date_precision")
        .eq("property_id", property.id).eq("source", "boligsiden").eq("field_name", "original_asking_price")
        .eq("method", "source_reported_original_asking").eq("data_mode", "real").is("owner_id", null),
    ]);
    if (episodeResult.error || evidenceResult.error) return result("read_failed", details);
    const episodes = (episodeResult.data ?? []) as EvidenceRow[];
    const candidates = episodes.filter(row => ["active", "unknown"].includes(row.status ?? "") && ["real", "unknown"].includes(row.data_mode ?? ""));
    const canonicalCandidates = property.current_episode_key ? candidates.filter(row => row.ingest_key === property.current_episode_key) : candidates;
    if (canonicalCandidates.length > 1 || (property.current_episode_key && candidates.length > 0 && canonicalCandidates.length === 0)) return result("ambiguous_episode", details);
    const candidate = canonicalCandidates[0];
    // Normal refreshes retain old episodes as unknown after a new start. An
    // explicit current key selects the new one without reactivating history.
    if (candidate && candidates.some(row => row.id !== candidate.id && row.status === "active")) return result("ambiguous_episode", details);
    if (candidate && (candidate.end_date != null || (property.current_episode_key && candidate.ingest_key !== property.current_episode_key))) {
      return result("ambiguous_episode", { ...details, reason: "current_episode_identity_mismatch" });
    }
    const documentedDate = property.listing_date_definition === "source_reported" ? property.listing_date : null;
    const episodeKey = property.current_episode_key ?? key("episode", "boligsiden", property.external_id, "real", documentedDate);
    // A closed/history episode sharing the canonical key must not be replaced
    // with a new undated active episode. Reconcile that identity explicitly.
    if (!candidate && episodes.some(row => row.ingest_key === episodeKey)) return result("ambiguous_episode", details);
    if (candidate && episodes.some(row => row.id !== candidate.id && row.ingest_key === episodeKey)) return result("ambiguous_episode", details);
    const evidence = evidenceResult.data ?? [];
    const currentEvidence = evidence.filter(row => candidate && row.episode_id === candidate.id &&
      typeof row.value?.sourceListingId === "string" && row.value.sourceListingId.toLowerCase() === property.external_id.toLowerCase() && row.value?.scope === "listing");
    const conflicts = currentEvidence.some(row => row.verification_status === "conflict" ||
      (typeof row.value?.price === "number" && row.value.price > 0 && row.value.price !== source.price));
    const matching = currentEvidence.find(row => row.verification_status === "verified" && !row.conflict_group &&
      row.value?.price === source.price && row.value?.originalDate === source.originalDate && row.effective_date === source.originalDate &&
      row.date_precision === (source.originalDate ? "day" : "unknown") && typeof row.observed_at === "string" && /^\d{4}-\d{2}-\d{2}T/.test(row.observed_at) &&
      Number.isFinite(Date.parse(row.observed_at)) && Date.parse(row.observed_at) <= Date.parse(observedAt));
    const needsIdentityUpdate = !candidate || candidate.data_mode !== "real" || candidate.status !== "active" || !candidate.campaign_id || candidate.ingest_key !== episodeKey;
    if (matching && !conflicts && !needsIdentityUpdate) return result("already_present", details);
    if (options.dryRun) return result(conflicts ? "conflict" : "would_persist", details);

    let episodeId = candidate?.id;
    if (needsIdentityUpdate) {
      // Use exactly the normal crawler's identities. A separate backfill-only
      // key would create a second active episode on the next regular refresh.
      const campaignKey = key("campaign", "boligsiden", property.external_id, "real");
      const campaign = await client.from("listing_campaigns").upsert({
        property_id: property.id, owner_id: null, source: "boligsiden", source_url: source.sourceUrl, observed_at: observedAt,
        ingest_key: campaignKey, link_reason: "Same source listing identifier; exact active identity verified during original-price backfill",
      }, { onConflict: "ingest_key" }).select("id").single();
      if (campaign.error || !campaign.data) return result("write_failed", details);
      if (candidate) {
        const updated = await client.from("listing_episodes").update({ campaign_id: campaign.data.id, ingest_key: episodeKey, data_mode: "real", status: "active", observed_at: observedAt })
          .eq("id", candidate.id).eq("property_id", property.id).is("owner_id", null);
        if (updated.error) return result("write_failed", details);
      } else {
        const episode = await client.from("listing_episodes").upsert({
          property_id: property.id, owner_id: null, campaign_id: campaign.data.id, source: "boligsiden", source_listing_id: property.external_id,
          source_url: source.sourceUrl, observed_at: observedAt, ingest_key: episodeKey,
          start_date: null, end_date: null, date_precision: "unknown", status: "active", data_mode: "real",
        }, { onConflict: "ingest_key" }).select("id").single();
        if (episode.error || !episode.data) return result("write_failed", details);
        episodeId = episode.data.id;
      }
    }
    if (!episodeId) return result("write_failed", details);
    const ingestKey = key("original-asking-price/v1", property.id, property.external_id.toLowerCase(), episodeId, source.price, source.originalDate, conflicts ? "conflict" : "verified");
    const existing = evidence.find(row => row.ingest_key === ingestKey);
    if (existing) return result(conflicts || existing !== matching ? "conflict" : "already_present", details);
    const saved = await client.from("source_observations").upsert({
      property_id: property.id, owner_id: null, episode_id: episodeId, ingest_key: ingestKey,
      field_name: "original_asking_price", value: { price: source.price, sourceListingId: property.external_id, scope: "listing", originalDate: source.originalDate,
        sourceAddressId: source.sourceAddressId, timelineUrl: source.timelineUrl, originalAt: source.originalAt },
      source: "boligsiden", source_url: source.sourceUrl, observed_at: observedAt,
      effective_date: source.originalDate, date_precision: source.originalDate ? "day" : "unknown",
      method: "source_reported_original_asking", verification_status: conflicts ? "conflict" : "verified", data_mode: "real",
      conflict_group: conflicts ? "source_original_price_conflict" : null,
      source_version: "original-price-backfill/v1",
    }, { onConflict: "ingest_key", ignoreDuplicates: true });
    return result(saved.error ? "write_failed" : conflicts ? "conflict" : "persisted", details);
  });
  const counters: Record<string, number> = { processed: results.length };
  for (const row of results) counters[row.outcome] = (counters[row.outcome] ?? 0) + 1;
  const ok = results.every(row => row.outcome !== "read_failed" && row.outcome !== "write_failed");
  return {
    ok, mode: "original-prices" as const, dryRun: options.dryRun, counters, results,
    batch: { afterId, batchSize: options.batchSize, total: countResult.count,
      nextAfterId: !ok ? afterId : rows.length > selected.length ? selected.at(-1)!.id : null },
  };
}

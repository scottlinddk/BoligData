import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListingSource, RawListing, SourceCrawlResult } from "./types.js";
import { fetchBoligsidenListings } from "./boligsiden.js";
import { fetchBoligaListings } from "./boliga.js";
import { enrichProperty } from "./enrich.js";
import { dedupeByExternalId, listingContentHash } from "./map-utils.js";
import { logError, logEvent } from "./log.js";
import { lookupAddressCadastral, type AddressCadastral } from "../enrichment-sources/address-lookup.js";
import { lookupMatrikelParcel } from "../enrichment-sources/matrikel.js";
import { mockModeEnabled } from "../enrichment-sources/types.js";
import { buildHistoryRows, persistHistoryRows, type PreviousListingObservation } from "./history.js";
import { enrichmentNeedsRefresh } from "./enrichment-refresh.js";
import { mapConcurrent } from "./concurrency.js";
import { envInt } from "./http.js";

const CHUNK_SIZE = 500;
// Fetch-stage errors (e.g. "skipped unmappable record") are capped separately
// from DB errors so a flood of the former can never crowd out the latter —
// the DB error is usually the one that actually explains a 502.
const MAX_FETCH_ERRORS_REPORTED = 5;
const MAX_DB_ERRORS_REPORTED = 5;
const ALL_SOURCES: readonly ListingSource[] = ["boligsiden", "boliga"];

/**
 * Which sources to crawl, comma-separated (default: both). Exists so a
 * source that's blocked upstream (e.g. Boliga's WAF 403s every request from
 * Vercel's datacenter IPs as of 2026-07-10 — see git history for the
 * attempted-and-failed browser-header workaround) can be disabled without a
 * code change, instead of the whole run reporting ok=false every night.
 */
export function enabledSources(): ListingSource[] {
  const raw = process.env.CRAWL_SOURCES?.trim();
  if (!raw) return [...ALL_SOURCES];
  const requested = raw.split(",").map((s) => s.trim().toLowerCase());
  const enabled = ALL_SOURCES.filter((s) => requested.includes(s));
  return enabled.length > 0 ? enabled : [...ALL_SOURCES];
}

export interface IngestSourceReport {
  source: ListingSource;
  /** False when the fetcher itself rejected — nothing was ingested for this source. */
  ok: boolean;
  complete: boolean;
  dataMode: "real" | "mock" | "unknown";
  quarantinedSales: number;
  fetched: number;
  upserted: number;
  /** Of `upserted`, how many were brand new rows (not previously in `properties`). */
  created: number;
  /** Records the fetcher saw but could not map to a valid RawListing. */
  skippedInvalid: number;
  /** Records that mapped fine but sit outside CRAWL_ZIP_RANGES — the filter working, not a fault. */
  skippedOutOfArea: number;
  enriched: number;
  /** Listings whose content_hash was unchanged and enrichment already exists. */
  enrichSkippedUnchanged: number;
  /** Address/cadastral lookups (id_lokalid/matrikelnr/ejerlav/zone) that failed — the property upsert still proceeds with those fields null. */
  cadastralLookupFailed: number;
  /** Matriklen parcel-area lookups that failed or were skipped (no matrikelnr/ejerlav yet) — registered_area_sqm stays null. */
  matrikelLookupFailed: number;
  dbErrors: number;
  errors: string[];
  durationMs: number;
}

export interface IngestResult {
  ok: boolean;
  reports: IngestSourceReport[];
  batch?: IngestBatchOptions & { total: number; nextOffset: number | null };
}

export interface IngestBatchOptions {
  offset: number;
  batchSize: number;
}

/**
 * Only source-documented dates belong in listing_date. A technical first
 * observation is not evidence that the property was first listed that day.
 */
export function resolveListingDate(
  mappedDate: string | null,
  existingDate: string | null,
): string | null {
  return mappedDate ?? existingDate;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * The `properties` columns carried by a RawListing, listed one by one rather
 * than spread. RawListing is deliberately *not* one-to-one with the table:
 * `sold_price_history` is enrichment data and lives on `enrichments`
 * (001_init_schema.sql), where enrich.ts writes it. Spreading the listing
 * into the upsert therefore handed PostgREST a column `properties` doesn't
 * have, and it rejects the *whole chunk* — "Could not find the
 * 'sold_price_history' column of 'properties' in the schema cache" — so a
 * field added for enrichment silently took the entire nightly crawl to zero
 * rows written. An explicit projection keeps the next RawListing field from
 * doing the same.
 */
function toPropertyColumns(l: RawListing, listingDate: string | null) {
  return {
    address: l.address,
    municipality: l.municipality,
    postal_code: l.postal_code,
    price: l.price,
    sqm: l.sqm,
    listing_date: listingDate,
    listing_date_definition: listingDate ? "source_reported" : "unknown",
    data_mode: l.data_mode ?? "unknown",
    listing_source: l.listing_source,
    external_id: l.external_id,
    lat: l.lat,
    lon: l.lon,
    status: l.status,
    building_year: l.building_year,
    property_type: l.property_type,
    rooms: l.rooms,
    images: l.images,
    description: l.description,
    agent_name: l.agent_name,
    listing_url: l.listing_url,
  };
}

async function ingestSource(
  client: SupabaseClient,
  source: ListingSource,
  settled: PromiseSettledResult<SourceCrawlResult>,
): Promise<IngestSourceReport> {
  const startedAt = Date.now();
  const concurrency = envInt("CRAWL_CONCURRENCY", 8, 1, 20);
  const report: IngestSourceReport = {
    source,
    ok: true,
    complete: false,
    dataMode: "unknown",
    quarantinedSales: 0,
    fetched: 0,
    upserted: 0,
    created: 0,
    skippedInvalid: 0,
    skippedOutOfArea: 0,
    enriched: 0,
    enrichSkippedUnchanged: 0,
    cadastralLookupFailed: 0,
    matrikelLookupFailed: 0,
    dbErrors: 0,
    errors: [],
    durationMs: 0,
  };

  // Fetch-stage errors (e.g. "skipped unmappable record") are capped
  // separately from DB errors so a flood of the former can never crowd out
  // the latter — the DB error is usually the one that actually explains a 502.
  let fetchErrorsReported = 0;
  let dbErrorsReported = 0;
  const pushFetchError = (message: string): void => {
    if (fetchErrorsReported < MAX_FETCH_ERRORS_REPORTED) {
      report.errors.push(message);
      fetchErrorsReported += 1;
    }
  };
  const pushDbError = (message: string): void => {
    if (dbErrorsReported < MAX_DB_ERRORS_REPORTED) {
      report.errors.push(message);
      dbErrorsReported += 1;
    }
  };

  if (settled.status === "rejected") {
    report.ok = false;
    const reason = settled.reason;
    pushFetchError(reason instanceof Error ? reason.message : String(reason));
    logError("crawl.source.fetch_failed", reason, { source });
    report.durationMs = Date.now() - startedAt;
    return report;
  }

  const { listings, stats } = settled.value;
  report.complete = stats.complete === true;
  report.dataMode = stats.dataMode ?? "unknown";
  report.fetched = listings.length;
  report.skippedInvalid = stats.recordsSkipped;
  report.skippedOutOfArea = stats.recordsOutOfArea;
  for (const err of stats.errors) pushFetchError(err);

  // A page-fetch error (blocked, drifted API, network failure) makes the
  // fetcher return a resolved promise with zero listings rather than reject
  // — otherwise a total upstream failure would look identical to "no new
  // listings this run" and the daily Action would go green on empty output.
  if (stats.errors.length > 0) {
    report.ok = false;
  }

  const now = new Date().toISOString();
  const hashByExternalId = new Map(listings.map((l) => [l.external_id, listingContentHash(l)]));

  // Existing fingerprints, fetched before the upsert overwrites them — the
  // basis for deciding which listings actually need (re-)enrichment.
  const existing = new Map<string, PreviousListingObservation & { id: string; content_hash: string | null; listing_date: string | null; first_seen_at: string | null }>();
  const blockedExternalIds = new Set<string>();
  for (const ids of chunk([...hashByExternalId.keys()], CHUNK_SIZE)) {
    const { data, error } = await client
      .from("properties")
      .select("id, external_id, content_hash, listing_date, listing_date_definition, price, status, last_seen_at, first_seen_at, current_episode_key")
      .eq("listing_source", source)
      .in("external_id", ids);
    if (error) {
      report.dbErrors += 1;
      pushDbError(`prefetch: ${error.message}`);
      logError("crawl.db.prefetch_failed", error, { source });
      // Without the previous snapshot we cannot safely preserve history or
      // technical first-seen metadata. Leave those rows intact for a retry.
      for (const id of ids) blockedExternalIds.add(id);
      continue;
    }
    for (const row of data ?? []) {
      existing.set(row.external_id as string, {
        id: row.id as string,
        content_hash: (row.content_hash as string | null) ?? null,
        price: Number(row.price),
        status: String(row.status),
        last_seen_at: row.last_seen_at ?? null,
        first_seen_at: row.first_seen_at ?? null,
        current_episode_key: row.current_episode_key ?? null,
        // Legacy dates may have been synthesized from first_seen; do not
        // carry them forward as documented source dates.
        listing_date: row.listing_date_definition === "source_reported" ? (row.listing_date as string | null) ?? null : null,
      });
    }
  }

  // Cadastral lookup (id_lokalid/matrikelnr/ejerlav/zone/bfe_nummer) is
  // per-property, not per-enrichment-source — it's needed both on the
  // properties row and later (Fase 3/4) as input to enrichProperty, so it's
  // resolved once here rather than inside enrich.ts. A failed lookup doesn't
  // block the upsert; the five columns simply stay null for that property.
  const cadastralByExternalId = new Map<string, AddressCadastral | null>();
  for (const listingChunk of chunk(listings, CHUNK_SIZE)) {
    const results = await mapConcurrent(
      listingChunk, concurrency, (l) => l.data_mode !== "real" || mockModeEnabled("ADDRESS_LOOKUP_MOCK_MODE")
        ? Promise.resolve({ ok: false as const, error: "Non-live cadastral source omitted" })
        : lookupAddressCadastral(l.address, l.postal_code, l.lat, l.lon),
    );
    results.forEach((result, i) => {
      const listing = listingChunk[i]!;
      if (!result.ok) {
        cadastralByExternalId.set(listing.external_id, null);
        report.cadastralLookupFailed += 1;
        pushFetchError(`cadastral lookup (${listing.external_id}): ${result.error}`);
        return;
      }
      cadastralByExternalId.set(listing.external_id, result.data);
    });
  }

  // Matriklen parcel-area lookup is keyed off matrikelnr/ejerlav (not
  // id_lokalid — parcels aren't addresses), so it can only run for listings
  // whose cadastral lookup above already succeeded.
  const registeredAreaByExternalId = new Map<string, number | null>();
  for (const listingChunk of chunk(listings, CHUNK_SIZE)) {
    const results = await mapConcurrent(
      listingChunk, concurrency, (l) => {
        const cadastral = cadastralByExternalId.get(l.external_id) ?? null;
        if (!cadastral || mockModeEnabled("MATRIKEL_MOCK_MODE")) {
          return Promise.resolve({ ok: false as const, error: "Non-live or unavailable cadastral source omitted" });
        }
        return lookupMatrikelParcel(cadastral.matrikelnr, cadastral.ejerlav);
      },
    );
    results.forEach((result, i) => {
      const listing = listingChunk[i]!;
      if (!result.ok) {
        registeredAreaByExternalId.set(listing.external_id, null);
        report.matrikelLookupFailed += 1;
        return;
      }
      registeredAreaByExternalId.set(listing.external_id, result.data.registeredAreaSqm);
    });
  }

  const propertyIdByExternalId = new Map<string, string>();
  async function persistListingHistory(listing: RawListing, propertyId: string): Promise<boolean> {
    const before = existing.get(listing.external_id) ?? null;
    const rows = buildHistoryRows({ ...listing,
      listing_date: resolveListingDate(listing.listing_date, before?.listing_date ?? null),
    }, propertyId, now, before);
    report.quarantinedSales += rows.quarantinedSales;
    try {
      const errors = await persistHistoryRows(client, rows);
      for (const error of errors) { report.dbErrors += 1; pushDbError(error); }
      return errors.length === 0;
    } catch (error) {
      report.dbErrors += 1;
      pushDbError(`history: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  // Persist existing-record history before replacing its previous price or
  // status. If history fails, a retry must still see the original transition.
  await mapConcurrent(listings, concurrency, async (listing) => {
    const before = existing.get(listing.external_id);
    if (!before || blockedExternalIds.has(listing.external_id)) return;
    if (!(await persistListingHistory(listing, before.id))) blockedExternalIds.add(listing.external_id);
  });
  for (const listingChunk of chunk(listings, CHUNK_SIZE)) {
    const rows = listingChunk.filter((listing) => !blockedExternalIds.has(listing.external_id)).map((l) => {
      const cadastral = cadastralByExternalId.get(l.external_id) ?? null;
      const listingDate = resolveListingDate(l.listing_date, existing.get(l.external_id)?.listing_date ?? null);
      return {
        ...toPropertyColumns(l, listingDate),
        content_hash: hashByExternalId.get(l.external_id),
        last_seen_at: now,
        first_seen_at: existing.has(l.external_id) ? existing.get(l.external_id)!.first_seen_at : now,
        current_episode_key: buildHistoryRows({ ...l, listing_date: listingDate }, existing.get(l.external_id)?.id ?? "new", now, existing.get(l.external_id) ?? null).episode.ingest_key,
        id_lokalid: cadastral?.idLokalid ?? null,
        matrikelnr: cadastral?.matrikelnr ?? null,
        ejerlav: cadastral?.ejerlav ?? null,
        zone: cadastral?.zone ?? null,
        bfe_nummer: cadastral?.bfeNummer ?? null,
        registered_area_sqm: registeredAreaByExternalId.get(l.external_id) ?? null,
      };
    });
    if (rows.length === 0) continue;
    const { data, error } = await client
      .from("properties")
      .upsert(rows, { onConflict: "listing_source,external_id" })
      .select("id, external_id");
    if (error) {
      report.dbErrors += 1;
      pushDbError(`properties upsert: ${error.message}`);
      logError("crawl.db.upsert_failed", error, { source, chunkSize: listingChunk.length });
      continue;
    }
    for (const row of data ?? []) {
      propertyIdByExternalId.set(row.external_id as string, row.id as string);
    }
    report.upserted += data?.length ?? 0;
  }

  // This runs for every observed listing, independent of enrichment hashes.
  // Only positively observed listings are touched: an incomplete or bounded
  // crawl provides no evidence that an unseen listing was removed or sold.
  await mapConcurrent(listings, concurrency, async (listing) => {
    if (existing.has(listing.external_id)) return;
    const propertyId = propertyIdByExternalId.get(listing.external_id);
    if (!propertyId) return;
    await persistListingHistory(listing, propertyId);
  });

  // Change detection: enrich listings that are new or whose content changed.
  // Unchanged listings still need enrichment if their enrichment row is
  // missing (e.g. a previous run's enrichment phase failed).
  const toEnrich: RawListing[] = [];
  const unchanged: RawListing[] = [];
  for (const listing of listings) {
    if (!propertyIdByExternalId.has(listing.external_id)) continue; // upsert chunk failed
    const before = existing.get(listing.external_id);
    if (!before) report.created += 1;
    if (!before || before.content_hash !== hashByExternalId.get(listing.external_id)) {
      toEnrich.push(listing);
    } else {
      unchanged.push(listing);
    }
  }

  const existingEnrichments = new Map<string, Record<string, unknown>>();
  for (const unchangedChunk of chunk(unchanged, CHUNK_SIZE)) {
    const ids = unchangedChunk.map((l) => propertyIdByExternalId.get(l.external_id)!);
    const { data, error } = await client.from("enrichments").select("property_id, source_status, enriched_at").in("property_id", ids);
    if (error) {
      report.dbErrors += 1;
      pushDbError(`enrichments check: ${error.message}`);
      logError("crawl.db.enrichment_check_failed", error, { source });
      continue;
    }
    for (const row of data ?? []) existingEnrichments.set(row.property_id as string, row);
    for (const listing of unchangedChunk) {
      const propertyId = propertyIdByExternalId.get(listing.external_id)!;
      if (!enrichmentNeedsRefresh(existingEnrichments.get(propertyId), listing, now)) {
        report.enrichSkippedUnchanged += 1;
      } else {
        toEnrich.push(listing);
      }
    }
  }

  // Persist small batches as they complete, so a slow register or interrupted
  // runner does not discard hundreds of successful lookups. On a retry, old
  // or missing snapshots are handled before recently attempted rows.
  toEnrich.sort((left, right) => {
    const stamp = (listing: RawListing) => {
      const value = existingEnrichments.get(propertyIdByExternalId.get(listing.external_id)!)?.enriched_at;
      return typeof value === "string" ? Date.parse(value) || 0 : 0;
    };
    return stamp(left) - stamp(right);
  });
  for (const enrichChunk of chunk(toEnrich, concurrency)) {
    // enrichProperty throwing (e.g. not-implemented real clients, upstream
    // API failure) must not abort the whole run — properties are already
    // upserted; a missing enrichment row is healed by the next run's
    // "unchanged but unenriched" pass above.
    let rows: Array<{ property_id: string } & Awaited<ReturnType<typeof enrichProperty>>>;
    try {
      rows = await mapConcurrent(
        enrichChunk, concurrency, async (listing) => ({
          property_id: propertyIdByExternalId.get(listing.external_id)!,
          ...(await enrichProperty(listing, cadastralByExternalId.get(listing.external_id) ?? null)),
        }),
      );
    } catch (err) {
      report.dbErrors += 1;
      pushDbError(`enrich: ${err instanceof Error ? err.message : String(err)}`);
      logError("crawl.enrich_failed", err, { source, chunkSize: enrichChunk.length });
      continue;
    }
    const { error } = await client.from("enrichments").upsert(rows, { onConflict: "property_id" });
    if (error) {
      report.dbErrors += 1;
      pushDbError(`enrichments upsert: ${error.message}`);
      logError("crawl.db.enrichment_upsert_failed", error, { source, chunkSize: rows.length });
      continue;
    }
    report.enriched += rows.length;
  }

  report.durationMs = Date.now() - startedAt;
  return report;
}

const FETCHERS: Record<ListingSource, () => Promise<SourceCrawlResult>> = {
  boligsiden: fetchBoligsidenListings,
  boliga: fetchBoligaListings,
};

/**
 * Runs the full ingest: fetch the enabled sources (isolated — one failing
 * doesn't abort the other), batch-upsert properties, and enrich only
 * new/changed listings (see properties.content_hash, migration 005).
 */
export async function runIngest(client: SupabaseClient, options?: IngestBatchOptions): Promise<IngestResult> {
  if (options && (!Number.isSafeInteger(options.offset) || options.offset < 0 || !Number.isSafeInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 50)) {
    throw new RangeError("Ingest batch requires a nonnegative integer offset and batchSize between 1 and 50");
  }
  const sources = enabledSources();
  const settled = await Promise.allSettled(sources.map((source) => FETCHERS[source]()));
  let total = 0;
  const selected = options ? settled.map((result): PromiseSettledResult<SourceCrawlResult> => {
    if (result.status === "rejected") return result;
    // Provider ordering can vary between requests. Deduplicate before slicing
    // so one source identity consumes exactly one slot in the stable order.
    const candidates = dedupeByExternalId(result.value.listings).sort((left, right) =>
      left.external_id < right.external_id ? -1 : left.external_id > right.external_id ? 1 : 0,
    );
    total = Math.max(total, candidates.length);
    return { status: "fulfilled", value: {
      listings: candidates.slice(options.offset, options.offset + options.batchSize),
      // A processed slice never proves absence elsewhere in the source feed.
      stats: { ...result.value.stats, complete: false },
    } };
  }) : settled;

  // Sources ingest sequentially on purpose: bounded memory and a simpler DB
  // contention profile matter more than wall-clock here.
  const reports: IngestSourceReport[] = [];
  for (let i = 0; i < sources.length; i++) {
    reports.push(await ingestSource(client, sources[i]!, selected[i]!));
  }

  for (const report of reports) logEvent("crawl.source.done", { ...report });

  const ok = reports.every((r) => r.ok && r.dbErrors === 0);
  logEvent("crawl.done", {
    ok,
    fetched: reports.reduce((sum, r) => sum + r.fetched, 0),
    upserted: reports.reduce((sum, r) => sum + r.upserted, 0),
    created: reports.reduce((sum, r) => sum + r.created, 0),
    enriched: reports.reduce((sum, r) => sum + r.enriched, 0),
    skippedUnchanged: reports.reduce((sum, r) => sum + r.enrichSkippedUnchanged, 0),
  });
  const batch = options ? { ...options, total,
    // Retrying a failed slice is idempotent. Never advertise progress past
    // source-fetch or database errors, even when part of that slice persisted.
    nextOffset: !ok ? options.offset : options.offset + options.batchSize < total ? options.offset + options.batchSize : null,
  } : undefined;
  return { ok, reports, ...(batch ? { batch } : {}) };
}

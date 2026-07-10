import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListingSource, RawListing, SourceCrawlResult } from "./types";
import { fetchBoligsidenListings } from "./boligsiden";
import { fetchBoligaListings } from "./boliga";
import { enrichProperty } from "./enrich";
import { listingContentHash } from "./map-utils";
import { logError, logEvent } from "./log";

const CHUNK_SIZE = 500;
const MAX_ERRORS_REPORTED = 10;

export interface IngestSourceReport {
  source: ListingSource;
  /** False when the fetcher itself rejected — nothing was ingested for this source. */
  ok: boolean;
  fetched: number;
  upserted: number;
  /** Of `upserted`, how many were brand new rows (not previously in `properties`). */
  created: number;
  /** Records the fetcher saw but could not map to a valid RawListing. */
  skippedInvalid: number;
  enriched: number;
  /** Listings whose content_hash was unchanged and enrichment already exists. */
  enrichSkippedUnchanged: number;
  dbErrors: number;
  errors: string[];
  durationMs: number;
}

export interface IngestResult {
  ok: boolean;
  reports: IngestSourceReport[];
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function pushError(report: IngestSourceReport, message: string): void {
  if (report.errors.length < MAX_ERRORS_REPORTED) report.errors.push(message);
}

async function ingestSource(
  client: SupabaseClient,
  source: ListingSource,
  settled: PromiseSettledResult<SourceCrawlResult>,
): Promise<IngestSourceReport> {
  const startedAt = Date.now();
  const report: IngestSourceReport = {
    source,
    ok: true,
    fetched: 0,
    upserted: 0,
    created: 0,
    skippedInvalid: 0,
    enriched: 0,
    enrichSkippedUnchanged: 0,
    dbErrors: 0,
    errors: [],
    durationMs: 0,
  };

  if (settled.status === "rejected") {
    report.ok = false;
    const reason = settled.reason;
    pushError(report, reason instanceof Error ? reason.message : String(reason));
    logError("crawl.source.fetch_failed", reason, { source });
    report.durationMs = Date.now() - startedAt;
    return report;
  }

  const { listings, stats } = settled.value;
  report.fetched = listings.length;
  report.skippedInvalid = stats.recordsSkipped;
  for (const err of stats.errors) pushError(report, err);

  const now = new Date().toISOString();
  const hashByExternalId = new Map(listings.map((l) => [l.external_id, listingContentHash(l)]));

  // Existing fingerprints, fetched before the upsert overwrites them — the
  // basis for deciding which listings actually need (re-)enrichment.
  const existing = new Map<string, { id: string; content_hash: string | null }>();
  for (const ids of chunk([...hashByExternalId.keys()], CHUNK_SIZE)) {
    const { data, error } = await client
      .from("properties")
      .select("id, external_id, content_hash")
      .eq("listing_source", source)
      .in("external_id", ids);
    if (error) {
      report.dbErrors += 1;
      pushError(report, `prefetch: ${error.message}`);
      logError("crawl.db.prefetch_failed", error, { source });
      continue;
    }
    for (const row of data ?? []) {
      existing.set(row.external_id as string, {
        id: row.id as string,
        content_hash: (row.content_hash as string | null) ?? null,
      });
    }
  }

  const propertyIdByExternalId = new Map<string, string>();
  for (const listingChunk of chunk(listings, CHUNK_SIZE)) {
    const rows = listingChunk.map((l) => ({
      ...l,
      content_hash: hashByExternalId.get(l.external_id),
      last_seen_at: now,
    }));
    const { data, error } = await client
      .from("properties")
      .upsert(rows, { onConflict: "listing_source,external_id" })
      .select("id, external_id");
    if (error) {
      report.dbErrors += 1;
      pushError(report, `properties upsert: ${error.message}`);
      logError("crawl.db.upsert_failed", error, { source, chunkSize: listingChunk.length });
      continue;
    }
    for (const row of data ?? []) {
      propertyIdByExternalId.set(row.external_id as string, row.id as string);
    }
    report.upserted += data?.length ?? 0;
  }

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

  const enrichedPropertyIds = new Set<string>();
  for (const unchangedChunk of chunk(unchanged, CHUNK_SIZE)) {
    const ids = unchangedChunk.map((l) => propertyIdByExternalId.get(l.external_id)!);
    const { data, error } = await client.from("enrichments").select("property_id").in("property_id", ids);
    if (error) {
      report.dbErrors += 1;
      pushError(report, `enrichments check: ${error.message}`);
      logError("crawl.db.enrichment_check_failed", error, { source });
      continue;
    }
    for (const row of data ?? []) enrichedPropertyIds.add(row.property_id as string);
    for (const listing of unchangedChunk) {
      const propertyId = propertyIdByExternalId.get(listing.external_id)!;
      if (enrichedPropertyIds.has(propertyId)) {
        report.enrichSkippedUnchanged += 1;
      } else {
        toEnrich.push(listing);
      }
    }
  }

  for (const enrichChunk of chunk(toEnrich, CHUNK_SIZE)) {
    const rows = await Promise.all(
      enrichChunk.map(async (listing) => ({
        property_id: propertyIdByExternalId.get(listing.external_id)!,
        ...(await enrichProperty(listing)),
      })),
    );
    const { error } = await client.from("enrichments").upsert(rows, { onConflict: "property_id" });
    if (error) {
      report.dbErrors += 1;
      pushError(report, `enrichments upsert: ${error.message}`);
      logError("crawl.db.enrichment_upsert_failed", error, { source, chunkSize: rows.length });
      continue;
    }
    report.enriched += rows.length;
  }

  report.durationMs = Date.now() - startedAt;
  return report;
}

/**
 * Runs the full ingest: fetch both sources (isolated — one failing doesn't
 * abort the other), batch-upsert properties, and enrich only new/changed
 * listings (see properties.content_hash, migration 005).
 */
export async function runIngest(client: SupabaseClient): Promise<IngestResult> {
  const [boligsiden, boliga] = await Promise.allSettled([
    fetchBoligsidenListings(),
    fetchBoligaListings(),
  ]);

  // Sources ingest sequentially on purpose: bounded memory and a simpler DB
  // contention profile matter more than wall-clock here.
  const reports = [
    await ingestSource(client, "boligsiden", boligsiden),
    await ingestSource(client, "boliga", boliga),
  ];

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
  return { ok, reports };
}

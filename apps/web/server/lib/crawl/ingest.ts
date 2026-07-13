import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListingSource, RawListing, SourceCrawlResult } from "./types.js";
import { fetchBoligsidenListings } from "./boligsiden.js";
import { fetchBoligaListings } from "./boliga.js";
import { enrichProperty } from "./enrich.js";
import { listingContentHash } from "./map-utils.js";
import { logError, logEvent } from "./log.js";
import { lookupAddressCadastral, type AddressCadastral } from "../enrichment-sources/address-lookup.js";
import { lookupMatrikelParcel } from "../enrichment-sources/matrikel.js";

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
function enabledSources(): ListingSource[] {
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
  fetched: number;
  upserted: number;
  /** Of `upserted`, how many were brand new rows (not previously in `properties`). */
  created: number;
  /** Records the fetcher saw but could not map to a valid RawListing. */
  skippedInvalid: number;
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
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
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
  report.fetched = listings.length;
  report.skippedInvalid = stats.recordsSkipped;
  for (const err of stats.errors) pushFetchError(err);

  // A page-fetch error (blocked, drifted API, network failure) makes the
  // fetcher return a resolved promise with zero listings rather than reject
  // — otherwise a total upstream failure would look identical to "no new
  // listings this run" and the daily Action would go green on empty output.
  if (listings.length === 0 && stats.errors.length > 0) {
    report.ok = false;
  }

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
      pushDbError(`prefetch: ${error.message}`);
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

  // Cadastral lookup (id_lokalid/matrikelnr/ejerlav/zone) is per-property,
  // not per-enrichment-source — it's needed both on the properties row and
  // later (Fase 3/4) as input to enrichProperty, so it's resolved once here
  // rather than inside enrich.ts. A failed lookup doesn't block the upsert;
  // the four columns simply stay null for that property.
  const cadastralByExternalId = new Map<string, AddressCadastral | null>();
  for (const listingChunk of chunk(listings, CHUNK_SIZE)) {
    const results = await Promise.all(
      listingChunk.map((l) => lookupAddressCadastral(l.address, l.postal_code, l.lat, l.lon)),
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
    const results = await Promise.all(
      listingChunk.map((l) => {
        const cadastral = cadastralByExternalId.get(l.external_id) ?? null;
        return lookupMatrikelParcel(cadastral?.matrikelnr ?? null, cadastral?.ejerlav ?? null);
      }),
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
  for (const listingChunk of chunk(listings, CHUNK_SIZE)) {
    const rows = listingChunk.map((l) => {
      const cadastral = cadastralByExternalId.get(l.external_id) ?? null;
      return {
        ...l,
        content_hash: hashByExternalId.get(l.external_id),
        last_seen_at: now,
        id_lokalid: cadastral?.idLokalid ?? null,
        matrikelnr: cadastral?.matrikelnr ?? null,
        ejerlav: cadastral?.ejerlav ?? null,
        zone: cadastral?.zone ?? null,
        registered_area_sqm: registeredAreaByExternalId.get(l.external_id) ?? null,
      };
    });
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
      pushDbError(`enrichments check: ${error.message}`);
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
    // enrichProperty throwing (e.g. not-implemented real clients, upstream
    // API failure) must not abort the whole run — properties are already
    // upserted; a missing enrichment row is healed by the next run's
    // "unchanged but unenriched" pass above.
    let rows: Array<{ property_id: string } & Awaited<ReturnType<typeof enrichProperty>>>;
    try {
      rows = await Promise.all(
        enrichChunk.map(async (listing) => ({
          property_id: propertyIdByExternalId.get(listing.external_id)!,
          ...(await enrichProperty(listing, cadastralByExternalId.get(listing.external_id) ?? null)),
        })),
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
export async function runIngest(client: SupabaseClient): Promise<IngestResult> {
  const sources = enabledSources();
  const settled = await Promise.allSettled(sources.map((source) => FETCHERS[source]()));

  // Sources ingest sequentially on purpose: bounded memory and a simpler DB
  // contention profile matter more than wall-clock here.
  const reports: IngestSourceReport[] = [];
  for (let i = 0; i < sources.length; i++) {
    reports.push(await ingestSource(client, sources[i]!, settled[i]!));
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
  return { ok, reports };
}

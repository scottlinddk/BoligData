import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPairStats, hasStatsCategory } from "./boligsiden-stats.js";
import { envInt } from "./http.js";
import { logError, logEvent } from "./log.js";
import { mockModeEnabled } from "../enrichment-sources/types.js";

export interface MarketStatsBatchOptions {
  offset: number;
  batchSize: number;
}

export interface MarketStatsBatchResult {
  ok: boolean;
  mode: "market-stats";
  batch: MarketStatsBatchOptions & { processed: number; total: number; nextOffset: number | null };
  upserted: number;
  /** Per-pair fetch failures. Informational: a failed pair never turns the batch red. */
  errors: string[];
}

const PAGE_SIZE = 1000;
const MAX_ERRORS_REPORTED = 5;

/** Sorted distinct (municipality, property_type) pairs that have a stats category. */
async function listPairs(client: SupabaseClient): Promise<Array<{ municipality: string; propertyType: string }>> {
  const unique = new Map<string, { municipality: string; propertyType: string }>();
  // PostgREST caps a response at 1000 rows, so page through the whole table.
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("properties")
      .select("municipality, property_type")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const municipality = row.municipality as string | null;
      const propertyType = row.property_type as string | null;
      if (!municipality || !propertyType || !hasStatsCategory(propertyType)) continue;
      unique.set(`${municipality}|${propertyType}`, { municipality, propertyType });
    }
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }
  return [...unique.values()].sort((a, b) =>
    a.municipality === b.municipality ? a.propertyType.localeCompare(b.propertyType) : a.municipality.localeCompare(b.municipality),
  );
}

/**
 * Refreshes Boligsiden Markedsindeks stats for a slice of the sorted
 * (municipality, property_type) pairs. Pairs are fetched one at a time and the
 * slice stops early once the time budget is spent, so a request stays under the
 * serverless limit; `nextOffset` advances by what was actually processed (at
 * least one pair, so the cursor always moves) and the caller resumes from there.
 */
export async function runMarketStatsBatch(
  client: SupabaseClient,
  { offset, batchSize }: MarketStatsBatchOptions,
  now = () => Date.now(),
): Promise<MarketStatsBatchResult> {
  const result: MarketStatsBatchResult = {
    ok: true,
    mode: "market-stats",
    batch: { offset, batchSize, processed: 0, total: 0, nextOffset: null },
    upserted: 0,
    errors: [],
  };
  // Mirrors the listing crawl: no live calls to Boligsiden in mock mode.
  if (mockModeEnabled("CRAWL_MOCK_MODE")) return result;

  const budgetMs = envInt("MARKET_STATS_BATCH_BUDGET_MS", 35_000, 1_000, 50_000);
  const startedAt = now();
  try {
    const pairs = await listPairs(client);
    result.batch.total = pairs.length;
    const slice = pairs.slice(offset, offset + batchSize);

    for (const { municipality, propertyType } of slice) {
      if (result.batch.processed > 0 && now() - startedAt > budgetMs) break;
      result.batch.processed++;
      try {
        const rows = await fetchPairStats(municipality, propertyType);
        if (rows.length === 0) {
          result.errors.push(`${municipality}/${propertyType}: no stats returned`);
          continue;
        }
        const { error } = await client
          .from("market_stats")
          .upsert(rows, { onConflict: "location_type,location_name,property_type,stat_type,period_start" });
        if (error) throw new Error(`market_stats upsert: ${error.message}`);
        result.upserted += rows.length;
      } catch (err) {
        result.errors.push(`${municipality}/${propertyType}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const next = offset + result.batch.processed;
    result.batch.nextOffset = next < pairs.length ? next : null;
  } catch (err) {
    result.ok = false;
    result.batch.nextOffset = offset;
    result.errors.push(err instanceof Error ? err.message : String(err));
    logError("crawl.market_stats_failed", err);
  }
  result.errors = result.errors.slice(0, MAX_ERRORS_REPORTED);
  logEvent("crawl.market_stats.batch", { ...result.batch, upserted: result.upserted, errors: result.errors.length });
  return result;
}

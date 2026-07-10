import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runIngest } from "./ingest";

/**
 * In-memory stand-in for the two tables the ingest touches, faking the exact
 * PostgREST call chains ingest.ts uses. CRAWL_MOCK_MODE defaults to true in
 * tests, so the fetchers return the committed fixtures (3 listings each).
 */
function fakeDb() {
  const properties = new Map<string, Record<string, unknown> & { id: string }>();
  const enrichments = new Map<string, Record<string, unknown>>();
  let nextId = 1;

  const client = {
    from(table: string) {
      if (table === "properties") {
        return {
          select: () => ({
            eq: (_col: string, source: string) => ({
              in: (_c: string, ids: string[]) =>
                Promise.resolve({
                  data: ids
                    .map((id) => properties.get(`${source}|${id}`))
                    .filter((row) => row !== undefined),
                  error: null,
                }),
            }),
          }),
          upsert: (rows: Array<Record<string, unknown>>) => ({
            select: () =>
              Promise.resolve({
                data: rows.map((row) => {
                  const key = `${row.listing_source}|${row.external_id}`;
                  const id = properties.get(key)?.id ?? `id-${nextId++}`;
                  properties.set(key, { ...row, id });
                  return { id, external_id: row.external_id };
                }),
                error: null,
              }),
          }),
        };
      }
      return {
        select: () => ({
          in: (_c: string, ids: string[]) =>
            Promise.resolve({
              data: ids.filter((id) => enrichments.has(id)).map((property_id) => ({ property_id })),
              error: null,
            }),
        }),
        upsert: (rows: Array<Record<string, unknown>>) => {
          for (const row of rows) enrichments.set(row.property_id as string, row);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, properties, enrichments };
}

describe("runIngest (mock mode, stubbed DB)", () => {
  it("upserts and enriches every fixture listing on the first run", async () => {
    const { client, enrichments } = fakeDb();
    const result = await runIngest(client);

    expect(result.ok).toBe(true);
    expect(result.reports).toHaveLength(2);
    for (const report of result.reports) {
      expect(report.ok).toBe(true);
      expect(report.fetched).toBeGreaterThan(0);
      expect(report.upserted).toBe(report.fetched);
      expect(report.created).toBe(report.fetched);
      expect(report.enriched).toBe(report.fetched);
      expect(report.enrichSkippedUnchanged).toBe(0);
      expect(report.dbErrors).toBe(0);
    }
    const totalFetched = result.reports.reduce((sum, r) => sum + r.fetched, 0);
    expect(enrichments.size).toBe(totalFetched);
  });

  it("skips re-enrichment for unchanged listings on the second run", async () => {
    const { client } = fakeDb();
    await runIngest(client);
    const second = await runIngest(client);

    expect(second.ok).toBe(true);
    for (const report of second.reports) {
      expect(report.upserted).toBe(report.fetched);
      expect(report.created).toBe(0);
      expect(report.enriched).toBe(0);
      expect(report.enrichSkippedUnchanged).toBe(report.fetched);
    }
  });

  it("re-enriches an unchanged listing whose enrichment row is missing", async () => {
    const { client, enrichments } = fakeDb();
    await runIngest(client);

    const [firstEnriched] = [...enrichments.keys()];
    enrichments.delete(firstEnriched!);

    const rerun = await runIngest(client);
    const totals = rerun.reports.reduce(
      (acc, r) => ({
        enriched: acc.enriched + r.enriched,
        skipped: acc.skipped + r.enrichSkippedUnchanged,
        fetched: acc.fetched + r.fetched,
      }),
      { enriched: 0, skipped: 0, fetched: 0 },
    );
    expect(totals.enriched).toBe(1);
    expect(totals.skipped).toBe(totals.fetched - 1);
    expect(enrichments.has(firstEnriched!)).toBe(true);
  });
});

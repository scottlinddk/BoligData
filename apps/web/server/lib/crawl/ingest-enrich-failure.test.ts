import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runIngest } from "./ingest";

// Simulates ENRICH_MOCK_MODE=false with no real clients implemented (or any
// enrichment crash): enrichProperty rejects for every listing.
vi.mock("./enrich.js", () => ({
  enrichProperty: vi.fn().mockRejectedValue(new Error("enrichment not implemented")),
}));

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
          in: () => Promise.resolve({ data: [], error: null }),
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

describe("runIngest when enrichProperty throws", () => {
  it("keeps upserted properties, reports the failure, and does not crash the run", async () => {
    const { client, properties, enrichments } = fakeDb();
    const result = await runIngest(client);

    // The run must complete and report failure rather than throwing out of
    // runIngest (which would turn into the handler's 500 crash path).
    expect(result.ok).toBe(false);
    for (const report of result.reports) {
      expect(report.upserted).toBe(report.fetched);
      expect(report.enriched).toBe(0);
      expect(report.dbErrors).toBeGreaterThan(0);
      expect(report.errors.some((e) => e.includes("enrich"))).toBe(true);
    }
    expect(properties.size).toBeGreaterThan(0);
    expect(enrichments.size).toBe(0);
  });
});

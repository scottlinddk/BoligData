import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveListingDate, runIngest } from "./ingest";

/**
 * Writable columns of the two tables, mirroring packages/supabase/migrations.
 * The fake DB below rejects anything else the way PostgREST does, because the
 * failure mode is invisible otherwise: a listing field that isn't a column
 * (sold_price_history, which belongs to `enrichments`) made the real upsert
 * reject every chunk while a permissive fake happily accepted the row.
 */
const PROPERTY_COLUMNS = new Set([
  "address",
  "municipality",
  "postal_code",
  "price",
  "sqm",
  "listing_date",
  "listing_source",
  "external_id",
  "lat",
  "lon",
  "status",
  "building_year",
  "property_type",
  "rooms",
  "images",
  "description",
  "agent_name",
  "listing_url",
  "content_hash",
  "last_seen_at",
  "id_lokalid",
  "matrikelnr",
  "ejerlav",
  "zone",
  "bfe_nummer",
  "registered_area_sqm",
]);

const ENRICHMENT_COLUMNS = new Set([
  "property_id",
  "bbr_data",
  "sold_price_history",
  "calculated_metrics",
  "risk_flags",
  "school_transport",
  "public_valuation",
  "source",
  "enriched_at",
]);

/** The PostgREST error a write to a non-existent column actually returns. */
function unknownColumnError(
  rows: Array<Record<string, unknown>>,
  columns: Set<string>,
  table: string,
): { message: string } | null {
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.has(key)) {
        return { message: `Could not find the '${key}' column of '${table}' in the schema cache` };
      }
    }
  }
  return null;
}

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
            select: () => {
              const error = unknownColumnError(rows, PROPERTY_COLUMNS, "properties");
              if (error) return Promise.resolve({ data: null, error });
              return Promise.resolve({
                data: rows.map((row) => {
                  const key = `${row.listing_source}|${row.external_id}`;
                  const id = properties.get(key)?.id ?? `id-${nextId++}`;
                  properties.set(key, { ...row, id });
                  return { id, external_id: row.external_id };
                }),
                error: null,
              });
            },
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
          const error = unknownColumnError(rows, ENRICHMENT_COLUMNS, "enrichments");
          if (error) return Promise.resolve({ data: null, error });
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

  // Regression: sold_price_history is enrichment data, not a properties
  // column. Spreading the RawListing into the properties upsert sent it
  // anyway, and PostgREST failed every chunk with "Could not find the
  // 'sold_price_history' column of 'properties' in the schema cache" — the
  // nightly crawl wrote nothing and returned 502.
  it("writes sold_price_history to enrichments and never to properties", async () => {
    const { client, properties, enrichments } = fakeDb();
    const result = await runIngest(client);

    expect(result.ok).toBe(true);
    expect(properties.size).toBeGreaterThan(0);
    for (const row of properties.values()) {
      expect(row).not.toHaveProperty("sold_price_history");
    }
    for (const row of enrichments.values()) {
      expect(row).toHaveProperty("sold_price_history");
    }
  });
});

// Regression: a re-crawled listing whose source date field can't be parsed
// (an undocumented/drifted upstream shape — see boligsiden.ts/boliga.ts)
// used to fall back to `new Date()` at mapping time, so it got bumped to
// "today" on *every* run rather than just its first. That silently pushed
// genuinely older listings above genuinely new ones in a newest-first sort,
// making real new listings look "missing" further down the results.
describe("resolveListingDate", () => {
  it("keeps the mapper's parsed date when it found one", () => {
    expect(resolveListingDate("2026-06-01", "2026-08-20", "2026-08-22")).toBe("2026-06-01");
  });

  it("falls back to the property's previously stored date, not today, on an unparseable re-crawl", () => {
    expect(resolveListingDate(null, "2026-06-01", "2026-08-22")).toBe("2026-06-01");
  });

  it("falls back to today only for a brand-new property with no stored date", () => {
    expect(resolveListingDate(null, null, "2026-08-22")).toBe("2026-08-22");
  });
});

describe("runIngest (CRAWL_SOURCES)", () => {
  const original = process.env.CRAWL_SOURCES;
  afterEach(() => {
    if (original === undefined) delete process.env.CRAWL_SOURCES;
    else process.env.CRAWL_SOURCES = original;
  });

  it("only crawls the requested source when CRAWL_SOURCES is set", async () => {
    process.env.CRAWL_SOURCES = "boligsiden";
    const { client } = fakeDb();
    const result = await runIngest(client);

    expect(result.reports).toHaveLength(1);
    expect(result.reports[0]!.source).toBe("boligsiden");
  });

  it("crawls both sources when CRAWL_SOURCES is unset, empty, or unrecognized", async () => {
    for (const value of [undefined, "", "  ", "not-a-real-source"]) {
      if (value === undefined) delete process.env.CRAWL_SOURCES;
      else process.env.CRAWL_SOURCES = value;

      const { client } = fakeDb();
      const result = await runIngest(client);
      expect(result.reports.map((r) => r.source).sort()).toEqual(["boliga", "boligsiden"]);
    }
  });
});

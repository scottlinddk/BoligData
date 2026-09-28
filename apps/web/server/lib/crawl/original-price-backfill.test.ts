import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { fetchOriginal } = vi.hoisted(() => ({ fetchOriginal: vi.fn() }));
vi.mock("./boligsiden-original-price.js", () => ({ fetchBoligsidenOriginalAsking: fetchOriginal }));
import { runOriginalPriceBackfill } from "./original-price-backfill.js";
import { buildHistoryRows } from "./history.js";
import type { RawListing } from "./types.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const caseId = "c4ed5ff9-9e86-4995-8250-c88a62189f27";
const key = (...parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
type Row = Record<string, any>;
const property = (n = 1, extra: Row = {}) => ({ id: id(n), listing_source: "boligsiden", external_id: caseId, status: "active", data_mode: "real", listing_url: "https://www.boligsiden.dk/adresse/example", address: "Example 1", postal_code: "2000", price: 4_195_000, current_episode_key: null, listing_date: null, listing_date_definition: "unknown", ...extra });
const episode = (extra: Row = {}) => ({ id: "episode-1", property_id: id(1), campaign_id: "campaign-1", source: "boligsiden", source_listing_id: caseId, owner_id: null, status: "active", data_mode: "real", ingest_key: key("episode", "boligsiden", caseId, "real", null), ...extra });
const exact = (extra: Row = {}) => ({ status: "exact", price: 4_495_000, originalDate: "2025-06-20", sourceUrl: "https://www.boligsiden.dk/adresse/example", sourceListingId: caseId, scope: "listing", observedAt: "2026-09-28T00:00:00Z", identityConfirmed: true, listingStatus: "active", ...extra });
const evidence = (extra: Row = {}) => ({ id: "evidence-1", property_id: id(1), episode_id: "episode-1", owner_id: null, source: "boligsiden", field_name: "original_asking_price", method: "source_reported_original_asking", data_mode: "real", verification_status: "verified", observed_at: "2025-06-21T12:00:00Z", effective_date: "2025-06-20", date_precision: "day", value: { price: 4_495_000, sourceListingId: caseId, scope: "listing", originalDate: "2025-06-20" }, ...extra });
type Call = { table: string; action: string; value?: Row; filters: Array<[string, string, unknown]>; limit?: number; columns?: string; selectOptions?: Row; writeOptions?: Row; order?: [string, Row] };
function database(properties: Row[], episodes: Row[] = [], observations: Row[] = [], fail?: (call: Call) => boolean) {
  const calls: Call[] = [];
  const tables: Record<string, Row[]> = { properties, listing_episodes: [...episodes], source_observations: [...observations], listing_campaigns: [] };
  const from = (table: string) => {
    const call: Call = { table, action: "select", filters: [] };
    let single = false;
    const query: any = {
      select(columns: string, options?: Row) { call.columns = columns; call.selectOptions = options; return query; },
      order(column: string, options: Row) { call.order = [column, options]; return query; },
      eq(column: string, value: unknown) { call.filters.push(["eq", column, value]); return query; },
      is(column: string, value: unknown) { call.filters.push(["eq", column, value]); return query; },
      gt(column: string, value: unknown) { call.filters.push(["gt", column, value]); return query; },
      limit(value: number) { call.limit = value; return query; },
      upsert(value: Row, options: Row) { call.action = "upsert"; call.value = value; call.writeOptions = options; return query; },
      update(value: Row) { call.action = "update"; call.value = value; return query; },
      single() { single = true; return query; },
      then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        const execute = () => {
          calls.push(call);
          if (fail?.(call)) return { data: null, count: null, error: { message: "private database failure" } };
          let rows = (tables[table] ?? []).filter(row => call.filters.every(([op, column, value]) => op === "gt" ? row[column] > value! : row[column] === value));
          if (call.action === "select") {
            const count = rows.length;
            if (call.order) rows = [...rows].sort((a, b) => a[call.order![0]].localeCompare(b[call.order![0]]));
            if (call.limit !== undefined) rows = rows.slice(0, call.limit);
            return { data: single ? rows[0] ?? null : rows, count, error: null };
          }
          if (call.action === "update") {
            for (const row of rows) Object.assign(row, call.value);
            return { data: null, error: null };
          }
          const found = tables[table]!.find(row => row.ingest_key === call.value!.ingest_key);
          const value = found ?? { id: `${table}-${tables[table]!.length + 1}` };
          if (!found || !call.writeOptions?.ignoreDuplicates) Object.assign(value, call.value);
          if (!found) tables[table]!.push(value);
          return { data: single ? value : null, error: null };
        };
        return Promise.resolve().then(execute).then(resolve, reject);
      },
    };
    return query;
  };
  return { client: { from } as unknown as SupabaseClient, calls, tables, writes: () => calls.filter(call => call.action !== "select") };
}
beforeEach(() => { vi.clearAllMocks(); fetchOriginal.mockResolvedValue(exact()); });
const options = (extra = {}) => ({ dryRun: true, afterId: null, batchSize: 4, ...extra });

describe("original asking-price backfill", () => {
  it("uses stable property UUID keyset pages and counts every source/provenance", async () => {
    const db = database([property(3, { listing_source: "boliga" }), property(1), property(2, { data_mode: "unknown" })]);
    const first = await runOriginalPriceBackfill(db.client, options({ batchSize: 2 }));
    expect(first.batch).toEqual({ afterId: null, batchSize: 2, total: 3, nextAfterId: id(2) });
    expect(first.results.map(row => row.id)).toEqual([id(1), id(2)]);
    expect(first.counters).toEqual({ processed: 2, would_persist: 2 });
    expect(db.calls.find(call => call.table === "properties" && !call.selectOptions?.head)?.limit).toBe(3);
    const last = await runOriginalPriceBackfill(db.client, options({ afterId: id(2) }));
    expect(last.batch).toEqual({ afterId: id(2), batchSize: 4, total: 3, nextAfterId: null });
    expect(last.results).toEqual([expect.objectContaining({ id: id(3), outcome: "unsupported_source" })]);
    expect(db.calls.filter(call => call.table === "properties").flatMap(call => call.filters)).toEqual([["gt", "id", id(2)]]);
    expect(db.writes()).toEqual([]);
  });

  it("classifies unsupported, demo, invalid identity and legacy rows without silent filtering", async () => {
    const db = database([property(1, { listing_source: "boliga" }), property(2, { data_mode: "demo" }), property(3, { external_id: "legacy" }), property(4, { data_mode: "unknown" })]);
    const result = await runOriginalPriceBackfill(db.client, options());
    expect(result.results.map(row => row.outcome)).toEqual(["unsupported_source", "nonlive_data", "invalid_source_identity", "would_persist"]);
    expect(fetchOriginal).toHaveBeenCalledOnce();
    expect(fetchOriginal).toHaveBeenCalledWith(expect.objectContaining({ sourceListingId: caseId, postalCode: "2000", currentAsking: 4_195_000 }));
    expect(fetchOriginal.mock.calls[0]![0]).not.toHaveProperty("addressId");
    expect(db.writes()).toEqual([]);
  });

  it("continues the batch after blocked/missing/closed/conflicting source results", async () => {
    const db = database([1, 2, 3, 4].map(n => property(n)));
    for (const status of ["unavailable", "missing", "not_current", "conflict"]) fetchOriginal.mockResolvedValueOnce(exact({ status }));
    const result = await runOriginalPriceBackfill(db.client, options({ dryRun: false }));
    expect(result.ok).toBe(true);
    expect(result.results.map(row => row.outcome)).toEqual(["unavailable", "missing", "not_current", "conflict"]);
    expect(db.writes()).toEqual([]);
  });

  it.each([{ identityConfirmed: false }, { listingStatus: "closed" }, { sourceListingId: id(99) }, { scope: "address" }, { price: 0 }, { price: Number.NaN }])("never persists unbound or invalid evidence %j", async overrides => {
    const db = database([property()]); fetchOriginal.mockResolvedValue(exact(overrides));
    expect((await runOriginalPriceBackfill(db.client, options({ dryRun: false }))).results[0]!.outcome).toBe("conflict");
    expect(db.writes()).toEqual([]);
  });

  it("makes no writes in dry run even when both identity links are missing", async () => {
    const db = database([property(1, { data_mode: "unknown" })]);
    expect((await runOriginalPriceBackfill(db.client, options())).results[0]!.outcome).toBe("would_persist");
    expect(db.writes()).toEqual([]);
  });

  it("reuses canonical crawler keys when making minimal source-confirmed identity links", async () => {
    const db = database([property(1, { data_mode: "unknown", listing_date: "2025-06-20", listing_date_definition: "source_reported" })]);
    const result = await runOriginalPriceBackfill(db.client, options({ dryRun: false }));
    expect(result.results[0]!.outcome).toBe("persisted");
    const writes = db.writes();
    expect(writes.map(call => call.table)).toEqual(["listing_campaigns", "listing_episodes", "source_observations"]);
    expect(writes[0]!.value?.ingest_key).toBe(key("campaign", "boligsiden", caseId, "real"));
    expect(writes[1]!.value).toMatchObject({ ingest_key: key("episode", "boligsiden", caseId, "real", "2025-06-20"), data_mode: "real", status: "active", start_date: null, end_date: null, date_precision: "unknown" });
    expect(writes[2]!.value).toMatchObject({ field_name: "original_asking_price", method: "source_reported_original_asking", data_mode: "real", verification_status: "verified", value: { price: 4_495_000, sourceListingId: caseId, scope: "listing", originalDate: "2025-06-20" } });
    expect(writes[2]!.writeOptions).toEqual({ onConflict: "ingest_key", ignoreDuplicates: true });
    db.calls.length = 0;
    expect((await runOriginalPriceBackfill(db.client, options({ dryRun: false }))).results[0]!.outcome).toBe("already_present");
    expect(db.writes()).toEqual([]);
  });

  it("preserves an existing current episode key for relisting identities", async () => {
    const db = database([property(1, { current_episode_key: "unknown:documented-relist-key" })]);
    await runOriginalPriceBackfill(db.client, options({ dryRun: false }));
    expect(db.writes().find(call => call.table === "listing_episodes")?.value?.ingest_key).toBe("unknown:documented-relist-key");
  });

  it("promotes a confirmed legacy episode without changing its chronology", async () => {
    const db = database([property()], [episode({ data_mode: "unknown", status: "unknown", ingest_key: "legacy-unknown-key", start_date: "2025-06-20", end_date: null })]);
    await runOriginalPriceBackfill(db.client, options({ dryRun: false }));
    const update = db.writes().find(call => call.action === "update");
    expect(update?.value).toMatchObject({ data_mode: "real", status: "active", ingest_key: key("episode", "boligsiden", caseId, "real", null) });
    expect(update?.value).not.toHaveProperty("start_date"); expect(update?.value).not.toHaveProperty("end_date");
    expect(db.tables.listing_episodes![0]!.start_date).toBe("2025-06-20");
    expect(db.tables.listing_episodes![0]!.id).toBe("episode-1");
    const regularRefresh = buildHistoryRows(property() as unknown as RawListing, id(1), "2026-09-28T12:00:00Z",
      { price: 4_195_000, status: "active", last_seen_at: null, current_episode_key: null });
    expect(regularRefresh.episode.ingest_key).toBe(db.tables.listing_episodes![0]!.ingest_key);
    db.calls.length = 0;
    expect((await runOriginalPriceBackfill(db.client, options({ dryRun: false }))).results[0]!.outcome).toBe("already_present");
    expect(db.writes()).toEqual([]);
  });

  it("does not attach an original to an ambiguous or closed canonical episode", async () => {
    const db = database([property()], [episode(), episode({ id: "episode-2" })]);
    expect((await runOriginalPriceBackfill(db.client, options({ dryRun: false }))).results[0]!.outcome).toBe("ambiguous_episode");
    expect(db.writes()).toEqual([]);
    const closed = database([property()], [episode({ status: "sold", ingest_key: key("episode", "boligsiden", caseId, "real", null) })]);
    expect((await runOriginalPriceBackfill(closed.client, options({ dryRun: false }))).results[0]!.outcome).toBe("ambiguous_episode");
    expect(closed.writes()).toEqual([]);
  });

  it.each([
    { property: { current_episode_key: "new-episode-key" }, episode: {} },
    { property: {}, episode: { end_date: "2026-05-01" } },
  ])("rejects a stale active/unknown episode instead of reactivating it %j", async fixture => {
    const db = database([property(1, fixture.property)], [episode(fixture.episode)]);
    expect((await runOriginalPriceBackfill(db.client, options({ dryRun: false }))).results[0]!.outcome).toBe("ambiguous_episode");
    expect(db.writes()).toEqual([]);
  });

  it("uses the explicit current episode after normal refresh marks the previous one unknown", async () => {
    const db = database([property(1, { current_episode_key: "current-relist" })], [episode({ ingest_key: "current-relist" }), episode({ id: "historical-episode", status: "unknown", ingest_key: "previous-episode" })]);
    expect((await runOriginalPriceBackfill(db.client, options({ dryRun: false }))).results[0]!.outcome).toBe("persisted");
    expect(db.writes()).toHaveLength(1);
    expect(db.writes()[0]!.value?.episode_id).toBe("episode-1");
    expect(db.tables.listing_episodes![1]!.status).toBe("unknown");
  });

  it("writes contradictory exact evidence additively as a visible conflict, then retries idempotently", async () => {
    const db = database([property()], [episode()], [evidence({ value: { price: 4_600_000, sourceListingId: caseId, scope: "listing", originalDate: "2025-06-20" } })]);
    expect((await runOriginalPriceBackfill(db.client, options())).results[0]!.outcome).toBe("conflict");
    expect(db.writes()).toEqual([]);
    expect((await runOriginalPriceBackfill(db.client, options({ dryRun: false }))).results[0]!.outcome).toBe("conflict");
    expect(db.writes()).toHaveLength(1);
    expect(db.writes()[0]!.value).toMatchObject({ verification_status: "conflict", conflict_group: "source_original_price_conflict" });
    expect(db.tables.source_observations).toHaveLength(2);
    expect(db.tables.source_observations![0]!.value.price).toBe(4_600_000);
    db.calls.length = 0;
    expect((await runOriginalPriceBackfill(db.client, options({ dryRun: false }))).results[0]!.outcome).toBe("conflict");
    expect(db.writes()).toEqual([]);
  });

  it("requires evidence belonging to the selected episode, never another listing period", async () => {
    const db = database([property()], [episode()], [evidence({ episode_id: "old-episode" })]);
    expect((await runOriginalPriceBackfill(db.client, options({ dryRun: false }))).results[0]!.outcome).toBe("persisted");
    expect(db.writes()[0]!.value?.episode_id).toBe("episode-1");
  });

  it.each(["select", "upsert"])("holds the cursor on a %s failure while still classifying remaining rows", async action => {
    const db = database([property(1), property(2, { listing_source: "boliga" })], [episode()], [], call => call.table === "source_observations" && call.action === action);
    const result = await runOriginalPriceBackfill(db.client, options({ dryRun: false }));
    expect(result.ok).toBe(false);
    expect(result.batch.nextAfterId).toBe(null);
    expect(result.results.map(row => row.outcome)).toEqual([action === "select" ? "read_failed" : "write_failed", "unsupported_source"]);
  });

  it("bounds concurrent source lookups at four even at the maximum batch size", async () => {
    let active = 0; let max = 0;
    fetchOriginal.mockImplementation(async () => { active++; max = Math.max(max, active); await new Promise(resolve => setTimeout(resolve, 1)); active--; return exact({ status: "missing" }); });
    const db = database(Array.from({ length: 8 }, (_, n) => property(n + 1)));
    expect((await runOriginalPriceBackfill(db.client, options({ batchSize: 8 }))).counters.processed).toBe(8);
    expect(max).toBe(4);
  });

  it("reports constant source reason codes without exposing raw exception strings", async () => {
    const db = database([property(1), property(2)]);
    fetchOriginal.mockResolvedValueOnce(exact({ status: "conflict", reason: "duration_mismatch" }));
    fetchOriginal.mockResolvedValueOnce(exact({ status: "unavailable", reason: "Error with a private credential" }));
    const result = await runOriginalPriceBackfill(db.client, options());
    expect(result.results[0]!.reason).toBe("duration_mismatch");
    expect(result.results[1]).not.toHaveProperty("reason");
  });
});

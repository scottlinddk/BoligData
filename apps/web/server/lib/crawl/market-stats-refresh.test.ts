import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const { fetchPairStats, fetchDstRegionalStats } = vi.hoisted(() => ({ fetchPairStats: vi.fn(), fetchDstRegionalStats: vi.fn() }));
vi.mock("./dst-stats.js", () => ({ fetchDstRegionalStats }));
vi.mock("./boligsiden-stats.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./boligsiden-stats.js")>()),
  fetchPairStats,
}));
vi.mock("./log.js", () => ({ logEvent: vi.fn(), logError: vi.fn() }));
import { runMarketStatsBatch } from "./market-stats-refresh.js";

type Row = { municipality: string | null; property_type: string | null };

function fakeClient(properties: Row[], upsertError: { message: string } | null = null) {
  const upsert = vi.fn().mockResolvedValue({ error: upsertError });
  const regionalUpsert = vi.fn().mockResolvedValue({ error: null });
  const ranges: Array<[number, number]> = [];
  const client = {
    from: (table: string) =>
      table === "market_stats"
        ? { upsert }
        : table === "regional_market_stats"
        ? { upsert: regionalUpsert }
        : {
            select: () => ({
              order: () => ({
                range: (from: number, to: number) => {
                  ranges.push([from, to]);
                  return Promise.resolve({ data: properties.slice(from, to + 1), error: null });
                },
              }),
            }),
          },
  } as unknown as SupabaseClient;
  return { client, upsert, regionalUpsert, ranges };
}

const statRow = (name: string, type: string) => ({ location_name: name, property_type: type, value: 1 });
const listings = (municipality: string, property_type: string, n = 1): Row[] => Array.from({ length: n }, () => ({ municipality, property_type }));

beforeEach(() => {
  vi.stubEnv("CRAWL_MOCK_MODE", "false");
  fetchPairStats.mockReset();
  fetchDstRegionalStats.mockReset();
  fetchDstRegionalStats.mockResolvedValue([{ region_code: "081" }, { region_code: "000" }]);
  fetchPairStats.mockImplementation(async (m: string, t: string) => [statRow(m, t)]);
});
afterEach(() => vi.unstubAllEnvs());

describe("runMarketStatsBatch", () => {
  it("does nothing in mock mode", async () => {
    vi.stubEnv("CRAWL_MOCK_MODE", "true");
    const { client } = fakeClient(listings("Aalborg", "villa"));
    const result = await runMarketStatsBatch(client, { offset: 0, batchSize: 2 });
    expect(fetchPairStats).not.toHaveBeenCalled();
    expect(result.batch.nextOffset).toBeNull();
  });

  it("walks the sorted distinct pairs, skips 'other', and ends with a null cursor", async () => {
    const { client, upsert } = fakeClient([
      ...listings("Aalborg", "villa", 3), ...listings("Aalborg", "apartment"), ...listings("Aalborg", "other"), ...listings("Brønderslev", "villa"),
    ]);
    const first = await runMarketStatsBatch(client, { offset: 0, batchSize: 2 });
    expect(fetchPairStats.mock.calls.map((c) => c.slice(0, 2))).toEqual([["Aalborg", "apartment"], ["Aalborg", "villa"]]);
    expect(first).toMatchObject({ ok: true, upserted: 2, batch: { processed: 2, total: 3, nextOffset: 2 } });
    expect(upsert).toHaveBeenCalledTimes(2);

    const last = await runMarketStatsBatch(client, { offset: 2, batchSize: 2 });
    expect(last.batch).toMatchObject({ processed: 1, nextOffset: null });
  });

  it("refreshes the DST regional series once, on the first slice only", async () => {
    const { client, regionalUpsert } = fakeClient([...listings("Aalborg", "villa"), ...listings("Brønderslev", "villa")]);
    const first = await runMarketStatsBatch(client, { offset: 0, batchSize: 1 });
    expect(fetchDstRegionalStats).toHaveBeenCalledTimes(1);
    expect(regionalUpsert).toHaveBeenCalledWith([{ region_code: "081" }, { region_code: "000" }], { onConflict: "source,region_code,category_code,stat_type,period_start" });
    expect(first.regionalUpserted).toBe(2);

    const second = await runMarketStatsBatch(client, { offset: 1, batchSize: 1 });
    expect(fetchDstRegionalStats).toHaveBeenCalledTimes(1);
    expect(second.regionalUpserted).toBe(0);
  });

  it("reports a DST failure as a warning and still refreshes Boligsiden pairs", async () => {
    fetchDstRegionalStats.mockRejectedValue(new Error("HTTP 503 from https://api.statbank.dk/v1/data"));
    const { client } = fakeClient(listings("Aalborg", "villa"));
    const result = await runMarketStatsBatch(client, { offset: 0, batchSize: 1 });
    expect(result.ok).toBe(true);
    expect(result.upserted).toBe(1);
    expect(result.errors).toEqual(["DST: HTTP 503 from https://api.statbank.dk/v1/data"]);
  });

  it("pages past PostgREST's 1000-row cap so later pairs are not missed", async () => {
    const { client, ranges } = fakeClient([...listings("Aalborg", "villa", 1000), ...listings("Frederikshavn", "villa")]);
    const result = await runMarketStatsBatch(client, { offset: 0, batchSize: 5 });
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(result.batch.total).toBe(2);
  });

  it("reports an empty or failing pair as a warning without failing the batch", async () => {
    fetchPairStats.mockImplementation(async (m: string, t: string) => {
      if (t === "apartment") return [];
      if (t === "villa") throw new Error("HTTP 403");
      return [statRow(m, t)];
    });
    const { client } = fakeClient([...listings("Aalborg", "apartment"), ...listings("Aalborg", "villa"), ...listings("Aalborg", "farm")]);
    const result = await runMarketStatsBatch(client, { offset: 0, batchSize: 3 });
    expect(result.ok).toBe(true);
    expect(result.upserted).toBe(1);
    expect(result.errors).toEqual(["Aalborg/apartment: no stats returned", "Aalborg/villa: HTTP 403"]);
  });

  it("stops early on the time budget but always processes at least one pair", async () => {
    vi.stubEnv("MARKET_STATS_BATCH_BUDGET_MS", "1000");
    let t = 0;
    const clock = () => (t += 5_000);
    const { client } = fakeClient([...listings("A", "villa"), ...listings("B", "villa"), ...listings("C", "villa")]);
    const result = await runMarketStatsBatch(client, { offset: 0, batchSize: 3 }, clock);
    expect(result.batch).toMatchObject({ processed: 1, total: 3, nextOffset: 1 });
  });

  it("flags a failed upsert as a warning and a failed pair listing as not ok with the cursor held", async () => {
    const upsertFail = fakeClient(listings("Aalborg", "villa"), { message: "relation does not exist" });
    const warned = await runMarketStatsBatch(upsertFail.client, { offset: 0, batchSize: 1 });
    expect(warned.errors).toEqual(["Aalborg/villa: market_stats upsert: relation does not exist"]);

    const broken = { from: () => ({ select: () => ({ order: () => ({ range: () => Promise.resolve({ data: null, error: new Error("db down") }) }) }) }) } as unknown as SupabaseClient;
    const failed = await runMarketStatsBatch(broken, { offset: 3, batchSize: 1 });
    expect(failed).toMatchObject({ ok: false, batch: { nextOffset: 3 } });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { ResearchHistoryResponse } from "../../../../../packages/shared/src/types/research-api.js";
import { handleResearch } from "./handlers.js";

const ID = "11111111-1111-4111-8111-111111111111";
type Row = Record<string, any>;
const original = (id: string, overrides: Row = {}): Row => ({
  id, property_id: ID, episode_id: "episode", field_name: "original_asking_price", source: "boligsiden",
  value: { price: 5_500_000, sourceListingId: "case-1", scope: "listing", originalDate: null },
  observed_at: "2026-09-01T00:00:00Z", effective_date: null, date_precision: "unknown", data_mode: "real",
  method: "source_reported_original_asking", verification_status: "unverified", conflict_group: null,
  owner_id: "private-owner", ingest_key: "private-ingest", ...overrides,
});
const episode: Row = { id: "episode", property_id: ID, observed_at: "2026-09-28T00:00:00Z" };

function fakeClient(tables: Record<string, Row[]>) {
  const calls: { table: string; filters: [string, unknown][]; limit: number }[] = [];
  return { calls, from(table: string) {
    const filters: [string, unknown][] = [];
    const orders: { field: string; ascending: boolean }[] = [];
    const builder = {
      select() { return builder; },
      eq(field: string, expected: unknown) { filters.push([field, expected]); return builder; },
      order(field: string, options: { ascending: boolean }) { orders.push({ field, ascending: options.ascending }); return builder; },
      async limit(limit: number) {
        calls.push({ table, filters, limit });
        const rows = (tables[table] ?? []).filter(row => filters.every(([field, value]) => row[field] === value)).sort((a, b) => {
          for (const { field, ascending } of orders) {
            const difference = String(a[field]).localeCompare(String(b[field]));
            if (difference) return ascending ? difference : -difference;
          }
          return 0;
        });
        return { data: rows.slice(0, limit), error: null };
      },
    };
    return builder;
  } };
}
async function run(client: ReturnType<typeof fakeClient>, query: Record<string, unknown> = { propertyId: ID }) {
  const response = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  response.status.mockReturnValue(response);
  await handleResearch({ method: "GET", query } as unknown as VercelRequest, response as unknown as VercelResponse,
    client as unknown as SupabaseClient, "user", "research-history");
  expect(response.status).toHaveBeenCalledWith(200);
  return response.json.mock.calls[0]![0] as ResearchHistoryResponse;
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-28T12:00:00Z")); });
afterEach(() => vi.useRealTimers());

describe("independently complete original asking evidence", () => {
  it("keeps originals and their conflicts after more than 500 newer routine observations", async () => {
    const routine = Array.from({ length: 600 }, (_, i) => original(`routine-${i}`, {
      field_name: "asking_price_change_percent", observed_at: "2026-09-28T00:00:00Z",
    }));
    const conflicting = original("conflicting", { value: { ...original("x").value, price: 6_000_000 } });
    const client = fakeClient({ listing_episodes: [episode], source_observations: [...routine, original("original"), conflicting,
      original("foreign", { property_id: "22222222-2222-4222-8222-222222222222" })] });
    const result = await run(client);
    expect(result.truncated).toBe(true);
    expect(result.observations).toHaveLength(500);
    expect(result.observations.every(row => row.fieldName === "asking_price_change_percent")).toBe(true);
    expect(result.originalAskingEvidence).toMatchObject({ propertyId: ID, complete: true });
    expect(result.originalAskingEvidence!.observations.map(row => row.id)).toEqual(["conflicting", "original"]);
    expect(result.originalAskingEvidence!.observations[0]).toMatchObject({ episodeId: "episode", effectiveDate: null,
      datePrecision: "unknown", value: { price: 6_000_000, originalDate: null } });
    expect(result.originalAskingEvidence!.observations[0]).not.toHaveProperty("ownerId");
    expect(result.originalAskingEvidence!.observations[0]).not.toHaveProperty("ingestKey");
    expect(client.calls.find(call => call.limit === 501)).toEqual({ table: "source_observations", limit: 501,
      filters: [["property_id", ID], ["field_name", "original_asking_price"]] });
  });

  it("certifies exactly 500 originals but marks an omitted 501st original incomplete", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => original(`original-${i.toString().padStart(3, "0")}`));
    const complete = await run(fakeClient({ listing_episodes: [episode], source_observations: rows.slice(0, 500) }));
    expect(complete.originalAskingEvidence!.observations).toHaveLength(500);
    expect(complete.originalAskingEvidence!.complete).toBe(true);
    const incomplete = await run(fakeClient({ listing_episodes: [episode], source_observations: rows }));
    expect(incomplete.originalAskingEvidence!.observations).toHaveLength(500);
    expect(incomplete.originalAskingEvidence!.complete).toBe(false);
  });

  it("does not certify evidence when the episode identity set may be incomplete", async () => {
    const episodes = Array.from({ length: 500 }, (_, i) => ({ ...episode, id: `episode-${i}` }));
    const result = await run(fakeClient({ listing_episodes: episodes, source_observations: [original("original")] }));
    expect(result.originalAskingEvidence!.observations).toHaveLength(1);
    expect(result.originalAskingEvidence!.complete).toBe(false);
  });

  it("changes history version when an original outside the ordinary observation window changes", async () => {
    const routine = Array.from({ length: 500 }, (_, i) => original(`routine-${i}`, {
      field_name: "asking_price_change_percent", observed_at: "2026-09-28T00:00:00Z",
    }));
    const rows = [...routine, original("original")];
    const before = await run(fakeClient({ listing_episodes: [episode], source_observations: rows }));
    rows[500]!.value = { ...rows[500]!.value, price: 6_000_000 };
    const after = await run(fakeClient({ listing_episodes: [episode], source_observations: rows }));
    expect(before.observations).toEqual(after.observations);
    expect(before.dataVersion).not.toBe(after.dataVersion);
  });

  it("does not advertise a property-scoped completeness guarantee on unscoped history", async () => {
    const client = fakeClient({ source_observations: [original("original")] });
    const result = await run(client, {});
    expect(result.originalAskingEvidence).toBeUndefined();
    expect(client.calls).toHaveLength(6);
  });
});

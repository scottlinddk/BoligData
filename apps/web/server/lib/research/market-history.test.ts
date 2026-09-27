import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { ResearchHistoryResponse } from "../../../../../packages/shared/src/types/research-api.js";
import { handleResearch, RESEARCH_MARKET_LIMIT } from "./handlers.js";
import { stubFetch } from "../test-support/stub-fetch.js";

const ID = "11111111-1111-4111-8111-111111111111";
type Row = Record<string, any>;
const subject: Row = { id: ID, municipality: "Aalborg", property_type: "villa", data_mode: "unknown" };
const sale = (id: string, overrides: Row = {}): Row => ({ id, property_id: id, properties: { address: `${id} 1`, municipality: "Aalborg", property_type: "villa" },
  sold_date: "2026-08-01", date_precision: "day", sale_price: 3_000_000, sale_type: "normal", residential_area: 140, area_definition: "residential", area_as_of: "2026-08-01",
  observed_at: "2026-09-25T00:00:00Z", data_mode: "real", source: "boligsiden", ...overrides });

function fakeClient(tables: Record<string, Row[]>) {
  const calls: { table: string; operation: string; args: unknown[] }[] = [];
  return { calls, from(table: string) {
    let filters: ((row: Row) => boolean)[] = [];
    const orders: { field: string; ascending: boolean }[] = [];
    const value = (row: Row, field: string) => field.split(".").reduce((current, key) => current?.[key], row as any);
    const data = () => (tables[table] ?? []).filter(row => filters.every(filter => filter(row))).sort((a, b) => {
      for (const { field, ascending } of orders) { const comparison = String(value(a, field)).localeCompare(String(value(b, field))); if (comparison) return ascending ? comparison : -comparison; }
      return 0;
    });
    const builder = {
      select(...args: unknown[]) { calls.push({ table, operation: "select", args }); return builder; },
      eq(field: string, expected: unknown) { calls.push({ table, operation: "eq", args: [field, expected] }); filters.push(row => value(row, field) === expected); return builder; },
      gte(field: string, expected: string) { filters.push(row => value(row, field) >= expected); return builder; },
      lte(field: string, expected: string) { filters.push(row => value(row, field) <= expected); return builder; },
      in(field: string, expected: unknown[]) { calls.push({ table, operation: "in", args: [field, expected] }); filters.push(row => expected.includes(value(row, field))); return builder; },
      order(field: string, options: { ascending: boolean }) { orders.push({ field, ascending: options.ascending }); return builder; },
      async range(from: number, to: number) { calls.push({ table, operation: "range", args: [from, to] }); return { data: data().slice(from, to + 1), error: null }; },
      async limit(limit: number) { calls.push({ table, operation: "limit", args: [limit] }); return { data: data().slice(0, limit), error: null }; },
      async maybeSingle() { return { data: data()[0] ?? null, error: null }; },
    };
    return builder;
  } };
}
async function run(client: ReturnType<typeof fakeClient>, query: Record<string, unknown> = { marketForPropertyId: ID }) {
  const response = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  response.status.mockReturnValue(response);
  await handleResearch({ method: "GET", query } as unknown as VercelRequest, response as unknown as VercelResponse, client as unknown as SupabaseClient, "user", "research-history");
  return { response, result: response.json.mock.calls[0]?.[0] as ResearchHistoryResponse };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-26T12:00:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("property-scoped market history", () => {
  it("returns a separate registered-sales population including homes not currently advertised", async () => {
    vi.stubEnv("BOLIGSIDEN_ADDRESS_API_BASE", "https://source.example/handler-market");
    stubFetch([{ body: { addresses: [{ addressID: "00000000-0000-4000-8000-000000000001", addressType: "villa", zipCode: 9000, municipality: { name: "Aalborg" }, coordinates: { lat: 57.055, lon: 9.92 }, road: { name: "Soldvej" }, houseNumber: "7", registrations: [{ amount: 2_000_000, livingArea: 130, date: "2026-08-01", type: "normal" }] }], totalHits: 1 } }]);
    const client = fakeClient({ properties: [{ ...subject, address: "Subjectvej 1", data_mode: "real", postal_code: "9000", lat: 57.05, lon: 9.90 }], sale_transactions: [sale("listing-only")] });
    const { result } = await run(client);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.address).toBe("Soldvej 7, 9000 Aalborg");
    expect(result.marketScope).toMatchObject({ population: "registered_postal_sales", postalCode: "9000" });
    expect(client.calls.every(call => call.table === "properties")).toBe(true);
  });

  it("retains stored sales with explicit source failure metadata", async () => {
    vi.stubEnv("BOLIGSIDEN_ADDRESS_API_BASE", "https://source.example/handler-failure");
    stubFetch([{ status: 403, body: {} }]);
    const { result } = await run(fakeClient({ properties: [{ ...subject, address: "Subjectvej 1", data_mode: "real", postal_code: "9000", lat: 57.05, lon: 9.90 }], sale_transactions: [sale("stored")] }));
    expect(result.transactions[0]?.id).toBe("stored");
    expect(result.marketScope).toMatchObject({ population: "stored_listing_sales", liveSourceUnavailable: true });
  });
  it("selects local comparable candidates before the cap and preserves conflicting transfer/area sources", async () => {
    const unrelated = Array.from({ length: 600 }, (_, i) => sale(`unrelated-${i}`, { properties: { municipality: "København", property_type: "villa" }, observed_at: "2026-09-26T00:00:00Z" }));
    const local = Array.from({ length: 6 }, (_, i) => sale(`local-${i}`));
    const conflicting = sale("other-source", { property_id: "local-0", sale_type: "family", residential_area: 200 });
    const client = fakeClient({ properties: [subject], sale_transactions: [...unrelated, ...local, conflicting,
      sale("old", { sold_date: "2024-09-25" }), sale("future", { sold_date: "2026-10-01" }), sale("mock", { data_mode: "mock" }),
      sale("flat", { properties: { municipality: "Aalborg", property_type: "apartment" } })],
      condition_evidence: [{ id: "condition", transaction_id: "local-0", data_mode: "real", excerpt: "Kræver renovering", source: "source", observed_at: "2026-08-01T00:00:00Z" }, { id: "foreign-condition", transaction_id: "unrelated-1", data_mode: "real" }] });
    const { result, response } = await run(client);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(result.transactions.map(row => row.id).sort()).toEqual([...local.map(row => row.id), conflicting.id].sort());
    expect(result.transactions.find(row => row.id === "other-source")?.saleType).toBe("family");
    expect(result.transactions.find(row => row.id === "other-source")?.transactionIdentity).toBe(result.transactions.find(row => row.id === "local-0")?.transactionIdentity);
    expect(result.conditionEvidence.map(row => row.id)).toEqual(["condition"]);
    expect(result.marketScope).toMatchObject({ propertyId: ID, municipality: "Aalborg", propertyType: "villa", saleFrom: "2024-09-26", saleTo: "2026-09-26" });
    expect(result.truncated).toBe(false);
    expect(client.calls.some(call => ["listing_episodes", "source_observations", "listing_campaigns"].includes(call.table))).toBe(false);
  });

  it("paginates past the previous 500-row window", async () => {
    const rows = Array.from({ length: 520 }, (_, i) => sale(`sale-${i}`));
    const client = fakeClient({ properties: [subject], sale_transactions: rows });
    const { result } = await run(client);
    expect(result.transactions).toHaveLength(520);
    expect(result.truncated).toBe(false);
    expect(client.calls.filter(call => call.table === "sale_transactions" && call.operation === "range").map(call => call.args)).toEqual([[0, 499], [500, 999]]);
  });

  it("marks the cap explicitly and drops its partial day instead of splitting source-conflict groups", async () => {
    const rows = Array.from({ length: RESEARCH_MARKET_LIMIT + 1 }, (_, i) => sale(`sale-${i.toString().padStart(5, "0")}`, { sold_date: i < 700 ? "2026-09-01" : i < 1400 ? "2026-08-01" : "2026-07-01" }));
    const { result } = await run(fakeClient({ properties: [subject], sale_transactions: rows }));
    expect(result.truncated).toBe(true);
    expect(result.transactions).toHaveLength(1400);
    expect(result.transactions.every(row => row.saleDate !== "2026-07-01")).toBe(true);
  });

  it("does not broaden a subject with missing municipality to a countrywide query", async () => {
    const client = fakeClient({ properties: [{ ...subject, municipality: null }] });
    const { result } = await run(client);
    expect(result.transactions).toEqual([]);
    expect(result.marketScope?.unavailableReason).toBe("missing_subject_location_or_type");
    expect(client.calls.every(call => call.table === "properties")).toBe(true);
  });

  it("rejects ambiguous/invalid query scopes and distinguishes a missing subject", async () => {
    for (const query of [{ marketForPropertyId: "not-a-uuid" }, { marketForPropertyId: [ID, ID] }, { marketForPropertyId: ID, propertyId: ID }]) {
      const client = fakeClient({});
      expect((await run(client, query)).response.status).toHaveBeenCalledWith(400);
      expect(client.calls).toHaveLength(0);
    }
    expect((await run(fakeClient({ properties: [] }))).response.status).toHaveBeenCalledWith(404);
  });
});

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildHistoryRows, persistHistoryRows } from "./history.js";
import type { RawListing } from "./types.js";

type Row = Record<string, unknown>;
const listing: RawListing = {
  address: "Testvej 1", municipality: "Aalborg", postal_code: "9000", price: 2_000_000, sqm: 100,
  listing_date: null, listing_source: "boligsiden", external_id: "case-1", lat: 57.05, lon: 9.92,
  status: "active", building_year: 1960, property_type: "villa", rooms: 4, images: [], description: null,
  agent_name: null, listing_url: "https://www.boligsiden.dk/test", sold_price_history: [], data_mode: "real",
};
const sale = { soldDate: "2020-01-01", price: 1_000_000, pricePerSqm: null, saleType: "normal" as const };
const history = (registrations: RawListing["sold_price_history"], propertyId = "property-1") =>
  buildHistoryRows({ ...listing, sold_price_history: registrations }, propertyId, "2026-09-27T10:00:00Z");

/** Simulates all three real unique indexes, including atomic batch failure. */
function database() {
  const tables = new Map<string, Row[]>();
  const state = { forcedError: null as { code: string; message: string } | null, failedRead: false };
  const rows = (table: string) => { if (!tables.has(table)) tables.set(table, []); return tables.get(table)!; };
  const fallback = (row: Row) => JSON.stringify([row.owner_id ?? null, row.property_id, row.sold_date, row.date_precision, row.sale_price, row.sale_type]);
  const registration = (row: Row) => row.registration_id == null ? null : JSON.stringify([row.owner_id ?? null, row.source, row.registration_id]);
  const client = { from(table: string) { return {
    upsert(values: Row[]) {
      const next = [...rows(table)];
      let error = table === "sale_transactions" ? state.forcedError : null;
      for (const row of values) {
        if (error) break;
        if (next.some((saved) => saved.ingest_key === row.ingest_key)) continue;
        if (table === "sale_transactions") {
          const duplicate = next.some((saved) => fallback(saved) === fallback(row) || (registration(row) !== null && registration(saved) === registration(row)));
          if (duplicate) { error = { code: "23505", message: "duplicate key violates unique constraint sale_transactions_fallback" }; break; }
        }
        next.push({ ...row, id: `${table}-${next.length}` });
      }
      if (!error) tables.set(table, next);
      const response = { error, data: error ? null : [{ id: `${table}-identity` }] };
      return Object.assign(Promise.resolve(response), { select: () => ({ single: () => Promise.resolve({ error, data: response.data?.[0] ?? null }) }) });
    },
    select() {
      const filters: [string, unknown][] = [];
      const query = {
        eq(field: string, value: unknown) { filters.push([field, value]); return query; },
        is(field: string, value: unknown) { filters.push([field, value]); return query; },
        limit() { return query; },
        maybeSingle() { return Promise.resolve({ data: rows(table).find((row) => filters.every(([field, value]) => (row[field] ?? null) === value)) ?? null, error: state.failedRead ? { message: "read failed" } : null }); },
      };
      return query;
    },
  }; } } as unknown as SupabaseClient;
  return { client, rows, state };
}

describe("sale history secondary identity constraints", () => {
  it("persists duplicate registration observations but one equivalent trade and retries idempotently", async () => {
    const db = database();
    const records = history([{ ...sale, registrationId: "reg-a" }, { ...sale, registrationId: "reg-b" }, { ...sale, soldDate: "2021-01-01", registrationId: "reg-c" }]);
    expect(await persistHistoryRows(db.client, records)).toEqual([]);
    expect(await persistHistoryRows(db.client, records)).toEqual([]);
    expect(db.rows("sale_transactions")).toHaveLength(2);
    expect(db.rows("source_observations").filter((row) => row.field_name === "sale_registration")).toHaveLength(3);
    expect(db.rows("sale_transactions").map((row) => row.sold_date)).toEqual(["2020-01-01", "2021-01-01"]);
  });

  it("recognizes a later registration ID without overwriting original provenance", async () => {
    const db = database();
    expect(await persistHistoryRows(db.client, history([sale]))).toEqual([]);
    const original = { ...db.rows("sale_transactions")[0] };
    expect(await persistHistoryRows(db.client, history([{ ...sale, registrationId: "new-id" }]))).toEqual([]);
    expect(db.rows("sale_transactions")).toEqual([original]);
    expect(db.rows("source_observations").filter((row) => row.field_name === "sale_registration")).toHaveLength(2);
  });

  it("does not treat another property or a conflicting price as the same sale", async () => {
    const db = database();
    await persistHistoryRows(db.client, history([{ ...sale, registrationId: "shared-id" }]));
    // A different ingest identity hitting the source-registration index must
    // still be rejected if no exact property/date/price/type match exists.
    const conflicting = history([{ ...sale, registrationId: "shared-id", price: 900_000 }], "other-property");
    conflicting.transactions[0]!.ingest_key = "distinct-key";
    expect(await persistHistoryRows(db.client, conflicting)).toHaveLength(1);
    expect(db.rows("sale_transactions")).toHaveLength(1);
  });

  it("never accepts a mock or private row as equivalent public real evidence", async () => {
    for (const provenance of [{ data_mode: "mock" }, { owner_id: "private-owner" }]) {
      const db = database();
      const records = history([{ ...sale, registrationId: "reg-a" }]);
      db.rows("sale_transactions").push({ ...records.transactions[0], ...provenance, ingest_key: "previous-row" });
      // Simulate a unique conflict even for the private case, to ensure the
      // recovery query never crosses ownership boundaries.
      db.state.forcedError = { code: "23505", message: "duplicate key" };
      expect(await persistHistoryRows(db.client, records)).toHaveLength(1);
      expect(db.rows("sale_transactions")).toHaveLength(1);
    }
  });

  it("rejects known area or asking-price contradictions while preserving both observations", async () => {
    for (const conflicting of [{ residential_area: 125 }, { area_definition: "weighted" }, { area_as_of: "2020-01-02" }, { first_asking_price: 1_600_000 }]) {
      const db = database();
      const original = history([{ ...sale, registrationId: "reg-a", residentialArea: 100, areaDefinition: "residential" }]);
      original.transactions[0]!.first_asking_price = 1_500_000;
      expect(await persistHistoryRows(db.client, original)).toEqual([]);
      const changed = history([{ ...sale, registrationId: "reg-b", residentialArea: 100, areaDefinition: "residential" }]);
      Object.assign(changed.transactions[0]!, conflicting);
      expect(await persistHistoryRows(db.client, changed)).toEqual(["sale_transactions: conflicting area, asking price or duration evidence for an existing trade"]);
      expect(db.rows("sale_transactions")).toHaveLength(1);
      expect(db.rows("sale_transactions")[0]?.residential_area).toBe(100);
      expect(db.rows("source_observations").filter((row) => row.field_name === "sale_registration")).toHaveLength(2);
    }
  });

  it("does not suppress nonunique failures or a failed equivalence read", async () => {
    const db = database();
    db.state.forcedError = { code: "42501", message: "permission denied" };
    expect(await persistHistoryRows(db.client, history([sale]))).toEqual(["sale_transactions: permission denied"]);
    db.state.forcedError = { code: "23505", message: "duplicate key" };
    db.state.failedRead = true;
    expect(await persistHistoryRows(db.client, history([sale]))).toEqual(["sale_transactions: read failed"]);
  });
});

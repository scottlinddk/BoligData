import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchProperties } from "./search";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

interface FakeRow {
  id: string;
  address: string;
  price: number;
  status: string;
}

const ROWS: FakeRow[] = [
  { id: "1", address: "Testvej 1", price: 1_000_000, status: "active" },
  { id: "2", address: "Testvej 2", price: 2_000_000, status: "active" },
  { id: "3", address: "Testvej 3", price: 3_000_000, status: "active" },
];

function nowIso() {
  return new Date().toISOString();
}

function toResponseRow(row: FakeRow, columns: string): Record<string, unknown> {
  if (columns === "*") {
    return {
      ...row,
      municipality: "Aalborg",
      postal_code: "9000",
      sqm: 80,
      listing_date: "2026-01-01",
      listing_source: "boliga",
      external_id: row.id,
      lat: 57,
      lon: 9.9,
      building_year: null,
      property_type: "other",
      rooms: null,
      image_urls: [],
      description: null,
      agent_name: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
  }
  return { id: row.id, address: row.address };
}

/** Minimal chainable stand-in for PostgrestFilterBuilder, thenable like the real thing. */
function fakeClient(rows: FakeRow[]): SupabaseClient {
  const client = {
    from(_table: string) {
      let selectedColumns = "*";
      let rangeStart = 0;
      let rangeEnd = rows.length - 1;

      const builder = {
        select(columns: string, _opts?: unknown) {
          selectedColumns = columns;
          return builder;
        },
        eq() {
          return builder;
        },
        or() {
          return builder;
        },
        gte() {
          return builder;
        },
        lte() {
          return builder;
        },
        order() {
          return builder;
        },
        range(from: number, to: number) {
          rangeStart = from;
          rangeEnd = to;
          return builder;
        },
        then(resolve: (value: { data: unknown[]; count: number; error: null }) => void) {
          const page = rows.slice(rangeStart, rangeEnd + 1).map((r) => toResponseRow(r, selectedColumns));
          resolve({ data: page, count: rows.length, error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return client;
}

describe("searchProperties", () => {
  it("returns address-only summaries and no properties when unauthenticated", async () => {
    const result = await searchProperties(fakeClient(ROWS), {}, false);
    expect(result.authenticated).toBe(false);
    expect(result.properties).toEqual([]);
    expect(result.summaries).toEqual([{ id: "1", address: "Testvej 1" }, { id: "2", address: "Testvej 2" }, { id: "3", address: "Testvej 3" }]);
    expect(result.total).toBe(3);
    // Anonymous rows must never carry price or other fields.
    for (const s of result.summaries as unknown as Record<string, unknown>[]) {
      expect(s).not.toHaveProperty("price");
    }
  });

  it("returns full property objects when authenticated", async () => {
    const result = await searchProperties(fakeClient(ROWS), {}, true);
    expect(result.authenticated).toBe(true);
    expect(result.summaries).toEqual([]);
    expect(result.properties).toHaveLength(3);
    expect(result.properties[0]).toMatchObject({ id: "1", address: "Testvej 1", price: 1_000_000 });
  });

  it("computes page and totalPages from limit/offset/total", async () => {
    const result = await searchProperties(fakeClient(ROWS), { limit: 2, offset: 2 }, true);
    expect(result.limit).toBe(2);
    expect(result.offset).toBe(2);
    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(2);
  });

  it("clamps limit to SEARCH_MAX_PAGE_SIZE", async () => {
    process.env.SEARCH_MAX_PAGE_SIZE = "2";
    const result = await searchProperties(fakeClient(ROWS), { limit: 50 }, true);
    expect(result.limit).toBe(2);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { InvalidSearchBoundaryError, parseBbox, searchProperties, splitLocationQuery } from "./search";
import { searchBoundaryContains } from "../../../../packages/shared/src/utils/search-boundary";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

interface FakeRow {
  id: string;
  address: string;
  price: number;
  status: string;
  lon?: number;
  lat?: number;
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
      lat: row.lat ?? 57,
      lon: row.lon ?? 9.9,
      building_year: null,
      property_type: "other",
      rooms: null,
      images: [],
      description: null,
      agent_name: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
  }
  return { id: row.id, address: row.address };
}

/** Minimal chainable stand-in for PostgrestFilterBuilder, thenable like the real thing. */
function fakeClient(
  rows: FakeRow[],
  enrichmentRows: Record<string, unknown>[] = [],
  calls: { method: string; args: unknown[] }[] = [],
): SupabaseClient {
  const client = {
    rpc(name: string, args: { boundary: [number, number][] }, options: unknown) {
      calls.push({ method: "rpc", args: [name, args, options] });
      // Model the DB set-returning function before outer projection/count/range.
      const spatialRows = rows.filter(row => searchBoundaryContains([row.lon ?? 9.9, row.lat ?? 57], args.boundary));
      return fakeClient(spatialRows, enrichmentRows, calls).from("properties");
    },
    from(table: string) {
      if (table === "enrichments") {
        const enrichmentBuilder = {
          select() {
            return enrichmentBuilder;
          },
          in() {
            return enrichmentBuilder;
          },
          then(resolve: (value: { data: unknown[]; error: null }) => void) {
            resolve({ data: enrichmentRows, error: null });
          },
        };
        return enrichmentBuilder;
      }

      let selectedColumns = "*";
      let rangeStart = 0;
      let rangeEnd = rows.length - 1;

      const builder = {
        select(columns: string, _opts?: unknown) {
          calls.push({ method: "select", args: [columns, _opts] });
          selectedColumns = columns;
          return builder;
        },
        eq(...args: unknown[]) {
          calls.push({ method: "eq", args });
          return builder;
        },
        or(...args: unknown[]) {
          calls.push({ method: "or", args });
          return builder;
        },
        in(...args: unknown[]) {
          calls.push({ method: "in", args });
          return builder;
        },
        ilike() {
          return builder;
        },
        gte(...args: unknown[]) {
          calls.push({ method: "gte", args });
          return builder;
        },
        lte(...args: unknown[]) {
          calls.push({ method: "lte", args });
          return builder;
        },
        order(...args: unknown[]) {
          calls.push({ method: "order", args });
          return builder;
        },
        range(from: number, to: number) {
          calls.push({ method: "range", args: [from, to] });
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

  it("accepts a postnummer filter without erroring", async () => {
    const result = await searchProperties(fakeClient(ROWS), { postnummer: "9000" }, true);
    expect(result.total).toBe(3);
  });

  it("attaches bbrData from the enrichments table onto authenticated properties", async () => {
    const bbrData = {
      yearBuilt: 1970,
      renovationYear: null,
      energyLabel: "C",
      areaSqm: 80,
      buildingType: "villa",
      heatingInstallation: "fjernvarme",
      floors: 1,
      roofMaterial: "tegl",
      wallMaterial: "mursten",
    };
    const result = await searchProperties(
      fakeClient(ROWS, [{ property_id: "1", bbr_data: bbrData, source_status: { bbr: { dataMode: "real" } } }]),
      {},
      true,
    );
    expect(result.properties.find((p) => p.id === "1")?.bbrData).toMatchObject({ ...bbrData, energyLabel: null });
    expect(result.properties.find((p) => p.id === "2")?.bbrData).toBeNull();
  });

  it("omits legacy and mock enrichment facts from search cards", async () => {
    const result = await searchProperties(fakeClient(ROWS, [
      { property_id: "1", bbr_data: { areaSqm: 180 }, risk_flags: { noiseExposureLden: 40, oilTankRisk: false, oilTankRiskSource: "bbr", soilContamination: { classification: "none" } } },
      { property_id: "2", bbr_data: { areaSqm: 180 }, source_status: { bbr: { dataMode: "mock" } } },
    ]), {}, true);
    expect(result.properties[0]?.bbrData).toBeNull();
    expect(result.properties[1]?.bbrData).toBeNull();
    expect(result.properties[0]?.riskFlags).toMatchObject({ noiseExposureLden: null, oilTankRiskSource: "heuristic", soilContamination: { classification: "unknown" } });
  });

  it("leaves bbrData null for anonymous summaries (no enrichments lookup needed)", async () => {
    const result = await searchProperties(fakeClient(ROWS), {}, false);
    expect(result.summaries.every((s) => !("bbrData" in s))).toBe(true);
  });

  it("filters by both address text and postal code when location includes a zip", async () => {
    const calls: { method: string; args: unknown[] }[] = [];
    await searchProperties(fakeClient(ROWS, [], calls), { location: "Rundvejen 7, 9000" }, true);
    expect(calls).toContainEqual({ method: "or", args: ["address.ilike.%Rundvejen 7%,municipality.ilike.%Rundvejen 7%"] });
    expect(calls).toContainEqual({ method: "eq", args: ["postal_code", "9000"] });
  });

  it("filters by postal code alone when location is only a zip code", async () => {
    const calls: { method: string; args: unknown[] }[] = [];
    await searchProperties(fakeClient(ROWS, [], calls), { location: "9000" }, true);
    expect(calls.some((c) => c.method === "or")).toBe(false);
    expect(calls).toContainEqual({ method: "eq", args: ["postal_code", "9000"] });
  });

  it("filters by property_type when propertyTypes is set", async () => {
    const calls: { method: string; args: unknown[] }[] = [];
    await searchProperties(fakeClient(ROWS, [], calls), { propertyTypes: ["villa", "cooperative"] }, true);
    expect(calls).toContainEqual({ method: "in", args: ["property_type", ["villa", "cooperative"]] });
  });

  it("does not filter by property_type when propertyTypes is empty", async () => {
    const calls: { method: string; args: unknown[] }[] = [];
    await searchProperties(fakeClient(ROWS, [], calls), { propertyTypes: [] }, true);
    expect(calls.some((c) => c.method === "in")).toBe(false);
  });

  it("filters by address/municipality text alone when location has no zip", async () => {
    const calls: { method: string; args: unknown[] }[] = [];
    await searchProperties(fakeClient(ROWS, [], calls), { location: "Aalborg" }, true);
    expect(calls).toContainEqual({ method: "or", args: ["address.ilike.%Aalborg%,municipality.ilike.%Aalborg%"] });
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "postal_code")).toBe(false);
  });

  it("filters by lon/lat when bbox is set", async () => {
    const calls: { method: string; args: unknown[] }[] = [];
    await searchProperties(fakeClient(ROWS, [], calls), { bbox: "9.8,57.0,9.95,57.05" }, true);
    expect(calls).toContainEqual({ method: "gte", args: ["lon", 9.8] });
    expect(calls).toContainEqual({ method: "lte", args: ["lon", 9.95] });
    expect(calls).toContainEqual({ method: "gte", args: ["lat", 57.0] });
    expect(calls).toContainEqual({ method: "lte", args: ["lat", 57.05] });
  });

  it("ignores a malformed bbox", async () => {
    const calls: { method: string; args: unknown[] }[] = [];
    await searchProperties(fakeClient(ROWS, [], calls), { bbox: "not-a-bbox" }, true);
    expect(calls.some((c) => c.args[0] === "lon" || c.args[0] === "lat")).toBe(false);
  });

  it("uses the full server-side polygon set before count, projection and pagination", async () => {
    const calls: { method: string; args: unknown[] }[] = [];
    const polygon = "[[9,57],[10,57],[10,58],[9.5,57.5],[9,58]]";
    const rows = [
      { ...ROWS[0]!, id: "outside-concavity", lon: 9.5, lat: 57.8 },
      { ...ROWS[1]!, id: "inside", lon: 9.5, lat: 57.25 },
      { ...ROWS[2]!, id: "edge", lon: 9.5, lat: 57 },
      { ...ROWS[0]!, id: "later-page", lon: 9.2, lat: 57.2 },
    ];
    const result = await searchProperties(fakeClient(rows, [], calls), { polygon, limit: 2, offset: 2, sortField: "price", sortDirection: "asc", minPrice: 1_000_000, bbox: "9,57,10,58", propertyTypes: ["villa"] }, true);
    expect(result.total).toBe(3);
    expect(result.totalPages).toBe(2);
    expect(result.properties.map(property => property.id)).toEqual(["later-page"]);
    expect(calls[0]).toEqual({ method: "rpc", args: ["properties_in_boundary", { boundary: JSON.parse(polygon) }, { count: "exact" }] });
    expect(calls).toContainEqual({ method: "eq", args: ["status", "active"] });
    expect(calls).toContainEqual({ method: "gte", args: ["price", 1_000_000] });
    expect(calls).toContainEqual({ method: "in", args: ["property_type", ["villa"]] });
    expect(calls).toContainEqual({ method: "lte", args: ["lat", 58] });
    expect(calls).toContainEqual({ method: "order", args: ["price", { ascending: true }] });
    expect(calls).toContainEqual({ method: "range", args: [2, 3] });
  });

  it("keeps polygon searches address-only for anonymous callers and includes polygon edges", async () => {
    const calls: { method: string; args: unknown[] }[] = [];
    const result = await searchProperties(fakeClient(ROWS, [], calls), { polygon: "[[9,57],[10,57],[10,58],[9,58]]" }, false);
    expect(result.properties).toEqual([]);
    expect(result.summaries).toHaveLength(3);
    expect(result.summaries[0]).not.toHaveProperty("price");
    expect(calls).toContainEqual({ method: "select", args: ["id, address", undefined] });
  });

  it("rejects invalid provided polygons before querying instead of returning unrestricted results", async () => {
    for (const polygon of ["", "invalid-json", "[]", "[[1,1],[2,2],[3,3]]", "[[0,0],[2,2],[0,2],[2,0]]"]) {
      const calls: { method: string; args: unknown[] }[] = [];
      await expect(searchProperties(fakeClient(ROWS, [], calls), { polygon }, true)).rejects.toBeInstanceOf(InvalidSearchBoundaryError);
      expect(calls).toEqual([]);
    }
    const calls: { method: string; args: unknown[] }[] = [];
    await searchProperties(fakeClient(ROWS, [], calls), { polygon: null }, true);
    expect(calls.some(call => call.method === "rpc")).toBe(false);
  });
});

describe("parseBbox", () => {
  it("parses a well-formed bbox string", () => {
    expect(parseBbox("9.8,57.0,9.95,57.05")).toEqual({ minLon: 9.8, minLat: 57.0, maxLon: 9.95, maxLat: 57.05 });
  });

  it("returns null for a missing, malformed, or short bbox", () => {
    expect(parseBbox(undefined)).toBeNull();
    expect(parseBbox("")).toBeNull();
    expect(parseBbox("1,2,3")).toBeNull();
    expect(parseBbox("a,b,c,d")).toBeNull();
  });
});

describe("splitLocationQuery", () => {
  it("splits trailing zip code from the address text", () => {
    expect(splitLocationQuery("Rundvejen 7, 9000")).toEqual({ text: "Rundvejen 7,", postalCode: "9000" });
  });

  it("splits a leading zip code from the address text", () => {
    expect(splitLocationQuery("9000 Aalborg")).toEqual({ text: "Aalborg", postalCode: "9000" });
  });

  it("returns just the postal code when the query is only a zip code", () => {
    expect(splitLocationQuery("9000")).toEqual({ text: "", postalCode: "9000" });
  });

  it("returns just the text when there is no zip code", () => {
    expect(splitLocationQuery("Aalborg")).toEqual({ text: "Aalborg", postalCode: null });
  });
});

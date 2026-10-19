import { beforeEach, describe, expect, it, vi } from "vitest";
import { backfillRiskFlags, needsBackfill } from "./backfill-risk-flags.js";
import { enrichProperty } from "./enrich.js";
import { lookupAddressCadastral } from "../enrichment-sources/address-lookup.js";

vi.mock("./enrich.js", () => ({ enrichProperty: vi.fn() }));
vi.mock("../enrichment-sources/address-lookup.js", () => ({ lookupAddressCadastral: vi.fn() }));

const real = { dataMode: "real" };
const unavailable = { dataMode: "unavailable" };
const payload = (status: Record<string, unknown>) => ({
  bbr_data: { yearBuilt: 1930 }, sold_price_history: [], calculated_metrics: {}, risk_flags: { noiseChecked: true },
  school_transport: null, public_valuation: null, source: "datafordeler", source_status: status, enriched_at: "2026-10-18T10:00:00Z",
});

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, address: "Hasserisgade 3", municipality: "Aalborg", postal_code: "9000", price: 2_000_000, sqm: 120, lat: 57.05, lon: 9.92,
    building_year: 1930, property_type: "villa", data_mode: "real", id_lokalid: null, matrikelnr: null, ejerlav: null, zone: null, bfe_nummer: null,
    enrichments: [{ sold_price_history: [{ soldDate: "2019-02-01", price: 3_000_000 }], source_status: { sales: real, noise: unavailable } }], ...overrides,
  };
}

/** A just-enough Supabase client: one page of rows, and a log of every write. */
function fakeClient(rows: unknown[]) {
  const writes: Array<{ table: string; op: string; values: Record<string, unknown>; id?: string }> = [];
  const client = {
    from: (table: string) => ({
      select: () => ({ order: () => ({ range: async (from: number) => ({ data: from === 0 ? rows : [], error: null }) }) }),
      update: (values: Record<string, unknown>) => ({ eq: async (_column: string, id: string) => { writes.push({ table, op: "update", values, id }); return { error: null }; } }),
      insert: async (values: Record<string, unknown>) => { writes.push({ table, op: "insert", values }); return { error: null }; },
    }),
  };
  return { client: client as never, writes };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lookupAddressCadastral).mockResolvedValue({ ok: true, data: {
    idLokalid: "0a3f509c-4f33-32b8-e044-0003ba298018", matrikelnr: null, ejerlav: null, ejerlavskode: null, bfeNummer: null, zone: null,
    lat: 57.05, lon: 9.92, postalCode: "9000", postalName: "Aalborg", municipalityCode: "0851", formattedAddress: "Hasserisgade 3, 9000 Aalborg", resolvedVia: "adressevaelger",
  } });
  vi.mocked(enrichProperty).mockResolvedValue(payload({ noise: real, soil_contamination: real, bbr: unavailable, sales: real }) as never);
});

describe("needsBackfill", () => {
  it("is true until noise, soil and BBR have all answered for real", () => {
    expect(needsBackfill(undefined)).toBe(true);
    expect(needsBackfill({ bbr: real, noise: real, soil_type: real, soil_contamination: real })).toBe(false);
    expect(needsBackfill({ bbr: real, noise: real, soil_type: real, soil_contamination: unavailable })).toBe(true);
  });
});

describe("backfillRiskFlags", () => {
  it("changes nothing on a dry run, but still reports what the registers answered", async () => {
    const { client, writes } = fakeClient([row("p1")]);
    const summary = await backfillRiskFlags(client, { write: false });
    expect(writes).toEqual([]);
    expect(summary).toMatchObject({ considered: 1, updated: 1, failed: 0, noiseReal: 1, soilReal: 1, bbrReal: 0 });
  });

  it("writes only the register-owned columns, keeping sold-price history and the other status keys", async () => {
    const { client, writes } = fakeClient([row("p1")]);
    await backfillRiskFlags(client, { write: true });
    const enrichment = writes.find((w) => w.table === "enrichments")!;
    expect(enrichment).toMatchObject({ op: "update", id: "p1" });
    expect(Object.keys(enrichment.values).sort()).toEqual(["bbr_data", "enriched_at", "risk_flags", "source_status"]);
    expect(enrichment.values.source_status).toMatchObject({ sales: real, noise: real, soil_contamination: real });
    // The sold-price history the row already had is what enrichProperty was given, and is never in the update.
    expect(vi.mocked(enrichProperty).mock.calls[0]![0].sold_price_history).toEqual([{ soldDate: "2019-02-01", price: 3_000_000 }]);
  });

  it("fills a missing husnummer on the property but never replaces one it has", async () => {
    const { client, writes } = fakeClient([row("p1"), row("p2", { id_lokalid: "kept-id" })]);
    await backfillRiskFlags(client, { write: true });
    expect(writes.filter((w) => w.table === "properties")).toEqual([
      { table: "properties", op: "update", values: { id_lokalid: "0a3f509c-4f33-32b8-e044-0003ba298018" }, id: "p1" },
    ]);
  });

  it("does not search for the address of a listing without live provenance, and uses its stored id", async () => {
    const { client } = fakeClient([row("p1", { data_mode: "unknown", id_lokalid: "stored-id" })]);
    await backfillRiskFlags(client, { write: true });
    expect(lookupAddressCadastral).not.toHaveBeenCalled();
    expect(vi.mocked(enrichProperty).mock.calls[0]![1]).toMatchObject({ idLokalid: "stored-id" });
  });

  it("skips properties without coordinates, honours --only-stale and --limit, and counts a failure without stopping", async () => {
    const fresh = row("fresh", { enrichments: [{ sold_price_history: [], source_status: { bbr: real, noise: real, soil_type: real, soil_contamination: real } }] });
    const { client } = fakeClient([row("nocoords", { lat: null, lon: null }), fresh, row("a"), row("b"), row("c")]);
    vi.mocked(enrichProperty).mockRejectedValueOnce(new Error("boom"));
    const summary = await backfillRiskFlags(client, { write: false, onlyStale: true, limit: 2, concurrency: 1 });
    expect(summary).toMatchObject({ considered: 2, updated: 1, failed: 1 });
    expect(summary.errors[0]).toContain("boom");
  });
});

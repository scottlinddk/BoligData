import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runIngest } from "./ingest.js";
import { fetchBoligsidenListings } from "./boligsiden.js";
import type { RawListing, SourceCrawlResult } from "./types.js";

vi.mock("./boligsiden.js", () => ({ fetchBoligsidenListings: vi.fn() }));
vi.mock("../enrichment-sources/address-lookup.js", () => ({ lookupAddressCadastral: vi.fn().mockResolvedValue({ ok: false, error: "offline" }) }));

const base: RawListing = {
  address: "Testvej 1", municipality: "Aalborg", postal_code: "9000", price: 4_300_000,
  sqm: 116, listing_date: null, listing_source: "boligsiden", external_id: "case-1",
  lat: 57.05, lon: 9.92, status: "active", building_year: 1960, property_type: "villa",
  rooms: 4, images: [], description: null, agent_name: null, listing_url: null,
  sold_price_history: [], data_mode: "real",
};
function result(listings: RawListing[], partial = false): SourceCrawlResult {
  return { listings, stats: { source: "boligsiden", complete: !partial, dataMode: "real", pagesFetched: 1, recordsSeen: listings.length, recordsSkipped: 0, recordsOutOfArea: 0, errors: partial ? ["page 2: unavailable"] : [] } };
}
function database() {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  const failures = new Set<string>();
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  };
  const client = {
    from(name: string) {
      const rows = table(name);
      return {
        select: () => ({
          eq: (_field: string, source: string) => ({ in: (_key: string, ids: string[]) => Promise.resolve({ data: [...rows.values()].filter((row) => row.listing_source === source && ids.includes(String(row.external_id))), error: null }) }),
          in: (_key: string, ids: string[]) => Promise.resolve({ data: [...rows.values()].filter((row) => ids.includes(String(row.property_id))), error: null }),
        }),
        update(values: Record<string, unknown>) {
          return { eq(_field: string, value: string) {
            const existing = rows.get(value);
            if (existing) rows.set(value, { ...existing, ...values });
            return Promise.resolve({ error: null });
          } };
        },
        upsert(values: Record<string, unknown>[], options: { ignoreDuplicates?: boolean }) {
          if (failures.has(name)) return Promise.resolve({ data: null, error: { message: "database write failed" } });
          const inserted = values.map((value) => {
            const key = String(name === "properties" ? value.external_id : name === "enrichments" ? value.property_id : value.ingest_key);
            const old = rows.get(key);
            const row = { ...old, ...value, id: old?.id ?? `${name}-${key}` };
            if (!old || !options.ignoreDuplicates) rows.set(key, row);
            return row;
          });
          const outcome = { data: inserted, error: null };
          return { select: () => Object.assign(Promise.resolve(outcome), { single: () => Promise.resolve({ data: inserted[0], error: null }) }), then: (fn: (data: typeof outcome) => unknown) => Promise.resolve(outcome).then(fn) };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, table, failures };
}

beforeEach(() => {
  vi.stubEnv("CRAWL_SOURCES", "boligsiden");
  vi.stubEnv("ENRICH_MOCK_MODE", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("ingest integrity across crawls", () => {
  it("does not mark a previously observed listing removed or sold after a partial crawl", async () => {
    const db = database();
    vi.mocked(fetchBoligsidenListings).mockResolvedValueOnce(result([base, { ...base, external_id: "case-2" }]));
    await runIngest(db.client);
    vi.mocked(fetchBoligsidenListings).mockResolvedValueOnce(result([base], true));
    const partial = await runIngest(db.client);
    expect(partial.reports[0]).toMatchObject({ ok: false, complete: false });
    expect(db.table("properties").get("case-2")?.status).toBe("active");
    expect([...db.table("listing_events").values()].some((event) => ["removed", "sold"].includes(String(event.event_type)))).toBe(false);
  });

  it("ingests a new registration with unchanged asking price and does not duplicate it on retry", async () => {
    const db = database();
    vi.mocked(fetchBoligsidenListings).mockResolvedValueOnce(result([base]));
    await runIngest(db.client);
    const updated = { ...base, sold_price_history: [{ soldDate: "2025-05-01", price: 3_000_000, pricePerSqm: null, saleType: "normal" as const, registrationId: "registration-1" }] };
    vi.mocked(fetchBoligsidenListings).mockResolvedValue(result([updated]));
    const changed = await runIngest(db.client);
    expect(changed.reports[0]?.enriched).toBe(1);
    expect(db.table("sale_transactions").size).toBe(1);
    await runIngest(db.client);
    expect(db.table("sale_transactions").size).toBe(1);
    expect(db.table("properties").get("case-1")?.listing_date).toBeNull();
    expect(db.table("listing_campaigns").size).toBe(1);
    expect(db.table("listing_episodes").size).toBe(1);
    const campaign = [...db.table("listing_campaigns").values()][0]!;
    const episode = [...db.table("listing_episodes").values()][0]!;
    expect(episode.campaign_id).toBe(campaign.id);
    expect([...db.table("listing_events").values()].every((event) => event.campaign_id === campaign.id && event.episode_id === episode.id)).toBe(true);
    expect([...db.table("sale_transactions").values()][0]).not.toHaveProperty("campaign_id");
  });

  it("retains a removed episode and creates a separate unknown-start episode for a confirmed relist", async () => {
    const db = database();
    const withDate = { ...base, listing_date: "2026-01-01" };
    vi.mocked(fetchBoligsidenListings).mockResolvedValueOnce(result([withDate]));
    await runIngest(db.client);
    vi.mocked(fetchBoligsidenListings).mockResolvedValueOnce(result([{ ...withDate, status: "withdrawn" }]));
    await runIngest(db.client);
    vi.mocked(fetchBoligsidenListings).mockResolvedValue(result([withDate]));
    await runIngest(db.client);
    await runIngest(db.client);
    const episodes = [...db.table("listing_episodes").values()];
    expect(episodes).toHaveLength(2);
    expect(episodes.find((episode) => episode.status === "removed")?.start_date).toBe("2026-01-01");
    expect(episodes.find((episode) => episode.status === "active")?.start_date).toBeNull();
    expect(episodes.every((episode) => episode.end_date === undefined)).toBe(true);
  });

  it("preserves the previous asking price when history fails so a retry can record the change", async () => {
    const db = database();
    vi.mocked(fetchBoligsidenListings).mockResolvedValueOnce(result([base]));
    await runIngest(db.client);
    db.failures.add("listing_events");
    vi.mocked(fetchBoligsidenListings).mockResolvedValue(result([{ ...base, price: 4_000_000 }]));
    const failed = await runIngest(db.client);
    expect(failed.ok).toBe(false);
    expect(db.table("properties").get("case-1")?.price).toBe(4_300_000);
    db.failures.clear();
    expect((await runIngest(db.client)).ok).toBe(true);
    expect(db.table("properties").get("case-1")?.price).toBe(4_000_000);
    expect([...db.table("listing_events").values()].filter((event) => event.event_type === "price_change")).toHaveLength(1);
  });
});

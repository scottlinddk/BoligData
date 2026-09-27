import { describe, expect, it } from "vitest";
import { buildHistoryRows } from "./history.js";
import { asIsoDate, listingContentHash } from "./map-utils.js";
import type { RawListing } from "./types.js";

const listing: RawListing = {
  address: "Testvej 1", municipality: "Aalborg", postal_code: "9000", price: 4_300_000,
  sqm: 116, listing_date: null, listing_source: "boligsiden", external_id: "test-1",
  lat: 57.05, lon: 9.92, status: "active", building_year: 1960, property_type: "villa",
  rooms: 4, images: [], description: "Nyt køkken", agent_name: "Mægler", listing_url: null,
  sold_price_history: [], data_mode: "real",
};
const observedAt = "2026-09-26T10:00:00Z";

describe("documented listing and sale history", () => {
  it("dates rounded source price changes without manufacturing first-listing events", () => {
    const input = { ...listing, reported_price_change: { currentAsking: listing.price, changePercent: -5.5 } };
    const rows = buildHistoryRows(input, "property-1", observedAt);
    const observation = (r: ReturnType<typeof buildHistoryRows>) => r.observations.find(o => o.field_name === "asking_price_change");
    expect(observation(rows)).toMatchObject({ value: input.reported_price_change, effective_date: "2026-09-26",
      method: "source_reported_price_change", verification_status: "unverified", data_mode: "real" });
    expect(rows.events).toHaveLength(1);
    expect(rows.episode.start_date).toBeNull();
    expect(listingContentHash(input)).not.toBe(listingContentHash(listing));
    expect(observation(buildHistoryRows(input, "property-1", "2026-09-26T15:00:00Z"))?.ingest_key).toBe(observation(rows)?.ingest_key);
    expect(observation(buildHistoryRows(input, "property-1", "2026-09-27T15:00:00Z"))?.ingest_key).not.toBe(observation(rows)?.ingest_key);
  });

  it("stores dated source-reported duration without inventing chronology or pricing evidence", () => {
    const withDuration = { ...listing, reported_time_on_market: { latestEpisodeDays: 464, totalDays: 700 } };
    const rows = buildHistoryRows(withDuration, "property-1", observedAt);
    expect(rows.observations.find((row) => row.field_name === "reported_time_on_market")).toMatchObject({
      value: { latestEpisodeDays: 464, totalDays: 700 }, effective_date: "2026-09-26", date_precision: "day",
      observed_at: observedAt, data_mode: "real", method: "source_reported_duration", verification_status: "unverified",
    });
    expect(rows.episode.start_date).toBeNull();
    expect(rows.events.map((event) => event.event_type)).toEqual(["observation"]);
    expect(rows.transactions).toEqual([]);
    expect(listingContentHash(withDuration)).not.toBe(listingContentHash(listing));
    expect(listingContentHash({ ...withDuration, reported_time_on_market: { latestEpisodeDays: 465, totalDays: 701 } })).not.toBe(listingContentHash(withDuration));
    const repeated = buildHistoryRows(withDuration, "property-1", "2026-09-26T12:00:00Z");
    const nextDay = buildHistoryRows(withDuration, "property-1", "2026-09-27T12:00:00Z");
    const observation = (values: ReturnType<typeof buildHistoryRows>) => values.observations.find((row) => row.field_name === "reported_time_on_market");
    expect(observation(repeated)?.ingest_key).toBe(observation(rows)?.ingest_key);
    expect(observation(nextDay)?.ingest_key).not.toBe(observation(rows)?.ingest_key);
    expect(observation(buildHistoryRows({ ...withDuration, data_mode: "mock" }, "property-1", observedAt))?.data_mode).toBe("mock");
  });

  it("detects new sales despite unchanged asking price, preserving unknown area", () => {
    const withSale = { ...listing, sold_price_history: [{ soldDate: "2025-06-01", price: 4_000_000, pricePerSqm: null, saleType: "normal" as const }] };
    expect(listingContentHash(withSale)).not.toBe(listingContentHash(listing));
    const rows = buildHistoryRows(withSale, "property-1", observedAt);
    expect(rows.transactions[0]).toMatchObject({ sale_price: 4_000_000, residential_area: null, area_definition: "unknown" });
    expect(rows.transactions[0]).not.toHaveProperty("first_asking_price");
    expect(rows.transactions[0]).not.toHaveProperty("last_asking_price");
  });

  it("does not invent a first listing date or backdate today's asking price", () => {
    const unknown = buildHistoryRows(listing, "property-1", observedAt);
    expect(unknown.episode.start_date).toBeNull();
    expect(unknown.events.map((event) => event.event_type)).toEqual(["observation"]);
    const known = buildHistoryRows({ ...listing, listing_date: "2026-01-01" }, "property-1", observedAt);
    expect(known.events.find((event) => event.event_type === "first_listing")).toMatchObject({ event_date: "2026-01-01", price: null });
  });

  it("records a detected price change as an interval instead of guessing its exact day", () => {
    const rows = buildHistoryRows(listing, "property-1", observedAt, { price: 4_600_000, status: "active", last_seen_at: "2026-09-20T12:00:00Z" });
    expect(rows.events.find((event) => event.event_type === "price_change")).toMatchObject({ event_date: "2026-09-20", event_date_end: "2026-09-26", date_precision: "interval", price: 4_300_000 });
  });

  it("quarantines future and invalid sale dates while retaining their source evidence", () => {
    const rows = buildHistoryRows({ ...listing, sold_price_history: [
      { soldDate: "2027-01-01", price: 3_000_000, pricePerSqm: null },
      { soldDate: "2026-02-30", price: 3_000_000, pricePerSqm: null },
    ] }, "property-1", observedAt);
    expect(rows.transactions).toHaveLength(0);
    expect(rows.quarantinedSales).toBe(2);
    expect(rows.observations.filter((row) => row.verification_status === "conflict")).toHaveLength(2);
    expect(asIsoDate("2026-02-30")).toBeNull();
  });

  it("preserves family sales and mock provenance without turning removal into a sale", () => {
    const rows = buildHistoryRows({ ...listing, status: "withdrawn", data_mode: "mock", sold_price_history: [{ soldDate: "2020-01-01", price: 1_000_000, pricePerSqm: 10000, saleType: "family" }] }, "property-1", observedAt, { price: listing.price, status: "active", last_seen_at: "2026-09-25T00:00:00Z" });
    expect(rows.episode.status).toBe("removed");
    expect(rows.events.some((row) => row.event_type === "sold")).toBe(false);
    expect(rows.transactions[0]).toMatchObject({ data_mode: "mock", sale_type: "family" });
  });

  it("deduplicates source registration identity across repeated observations", () => {
    const sale = { soldDate: "2020-01-01", price: 1_000_000, pricePerSqm: null, registrationId: "reg-1" };
    const first = buildHistoryRows({ ...listing, sold_price_history: [sale] }, "property-1", observedAt);
    const second = buildHistoryRows({ ...listing, external_id: "new-case", sold_price_history: [sale] }, "property-2", "2026-09-27T00:00:00Z");
    expect(first.transactions[0]?.ingest_key).toBe(second.transactions[0]?.ingest_key);
  });
});

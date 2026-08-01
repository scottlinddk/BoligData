import { afterEach, describe, expect, it, vi } from "vitest";
import { boxPolygon, lookupBoligsidenSales } from "./boligsiden-sales.js";
import { stubFetch } from "../test-support/stub-fetch.js";

/** Floravej 6, 9000 Aalborg — the address the register lookups are pinned to elsewhere. */
const LAT = 57.04591973;
const LON = 9.87640126;

/**
 * One /search/addresses record, shaped as the live API answers it
 * (2026-08-01): coordinates as {lat, lon}, road/houseNumber/zipCode/cityName
 * separately, and the address's registered sales under `registrations`.
 */
function addressRecord(overrides: Record<string, unknown> = {}) {
  return {
    addressID: "a1",
    addressType: "villa",
    coordinates: { lat: 57.046623, lon: 9.876311, type: "EPSG4326" },
    road: { name: "Floravej" },
    houseNumber: "13",
    zipCode: 9000,
    cityName: "Aalborg",
    boligsidenInfo: { latestSoldArea: 186 },
    registrations: [
      { amount: 4_100_000, date: "2024-05-02", livingArea: 180, perAreaPrice: 22778, type: "normal" },
      { amount: 2_450_000, date: "2013-09-11", area: 180, type: "normal" },
    ],
    ...overrides,
  };
}

function body(addresses: unknown[]) {
  return { addresses, totalHits: addresses.length };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("boxPolygon", () => {
  it("emits lon,lat corner pairs — the opposite order to the rest of this repo", () => {
    const polygon = boxPolygon(57, 10, 500);
    const corners = polygon.split("|").map((c) => c.split(",").map(Number));
    expect(corners).toHaveLength(4);
    for (const [lon, lat] of corners) {
      expect(lat).toBeCloseTo(57, 1);
      expect(lon).toBeCloseTo(10, 1);
    }
  });

  it("widens the longitude span with latitude, so the box stays roughly square on the ground", () => {
    const [wideLon] = boxPolygon(57, 10, 500).split("|")[0]!.split(",").map(Number);
    const [equatorLon] = boxPolygon(0, 10, 500).split("|")[0]!.split(",").map(Number);
    expect(10 - wideLon!).toBeGreaterThan(10 - equatorLon!);
  });
});

describe("lookupBoligsidenSales (live)", () => {
  it("queries a polygon around the point, newest sales first", async () => {
    const stub = stubFetch([{ body: body([addressRecord()]) }]);
    await lookupBoligsidenSales(LAT, LON);

    const url = stub.urls[0]!;
    expect(url).toContain("api.boligsiden.dk/search/addresses");
    expect(url).toContain("sortBy=soldDate");
    expect(url).toContain("sortAscending=false");
    expect(decodeURIComponent(url)).toContain("polygon=9.8");
  });

  it("separates the subject address from its neighbours by coordinate", async () => {
    const subject = addressRecord({
      coordinates: { lat: LAT, lon: LON },
      houseNumber: "6",
      registrations: [{ amount: 3_000_000, date: "2019-02-01", livingArea: 150, type: "normal" }],
    });
    stubFetch([{ body: body([subject, addressRecord()]) }]);

    const result = await lookupBoligsidenSales(LAT, LON);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.priceHistory).toHaveLength(1);
    expect(result.data.priceHistory[0]?.price).toBe(3_000_000);
    // The subject must not also show up as one of its own neighbours.
    expect(result.data.nearbySales.map((s) => s.address)).toEqual(["Floravej 13, 9000 Aalborg"]);
  });

  it("reports the neighbour's most recent sale, with distance and sale type", async () => {
    stubFetch([{ body: body([addressRecord()]) }]);
    const result = await lookupBoligsidenSales(LAT, LON);
    if (!result.ok) throw new Error("expected ok");

    const sale = result.data.nearbySales[0]!;
    expect(sale.soldDate).toBe("2024-05-02");
    expect(sale.price).toBe(4_100_000);
    expect(sale.pricePerSqm).toBe(22778);
    expect(sale.saleType).toBe("normal");
    expect(sale.areaSqm).toBe(186);
    expect(sale.propertyType).toBe("villa");
    expect(sale.distanceMeters).toBeGreaterThan(0);
    expect(sale.distanceMeters).toBeLessThan(500);
  });

  it("carries a family transfer through as such rather than dropping or normalising it", async () => {
    stubFetch([
      {
        body: body([
          addressRecord({ registrations: [{ amount: 900_000, date: "2023-01-05", livingArea: 150, type: "family" }] }),
        ]),
      },
    ]);
    const result = await lookupBoligsidenSales(LAT, LON);
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.nearbySales[0]?.saleType).toBe("family");
  });

  it("skips addresses that have never been sold instead of listing them at price zero", async () => {
    stubFetch([{ body: body([addressRecord({ registrations: [] }), addressRecord({ registrations: undefined })]) }]);
    const result = await lookupBoligsidenSales(LAT, LON);
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.nearbySales).toEqual([]);
  });

  it("orders neighbours by distance, nearest first", async () => {
    stubFetch([
      {
        body: body([
          addressRecord({ coordinates: { lat: LAT + 0.004, lon: LON }, houseNumber: "99" }),
          addressRecord({ coordinates: { lat: LAT + 0.0005, lon: LON }, houseNumber: "8" }),
        ]),
      },
    ]);
    const result = await lookupBoligsidenSales(LAT, LON);
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.nearbySales.map((s) => s.address)).toEqual([
      "Floravej 8, 9000 Aalborg",
      "Floravej 99, 9000 Aalborg",
    ]);
  });

  it("honours the requested limit", async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      addressRecord({ coordinates: { lat: LAT + (i + 1) * 0.0003, lon: LON }, houseNumber: String(i + 1) }),
    );
    stubFetch([{ body: body(many) }]);
    const result = await lookupBoligsidenSales(LAT, LON, { limit: 3 });
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.nearbySales).toHaveLength(3);
  });

  it("refuses a point outside Denmark rather than searching the Atlantic", async () => {
    const stub = stubFetch([{ body: body([]) }]);
    const result = await lookupBoligsidenSales(0, 0);
    expect(result.ok).toBe(false);
    expect(stub.urls).toHaveLength(0);
  });

  it("reports an upstream failure instead of an empty 'no sales nearby'", async () => {
    stubFetch([{ status: 400 }]);
    const result = await lookupBoligsidenSales(LAT, LON);
    expect(result.ok).toBe(false);
  });
});

describe("lookupBoligsidenSales (mock mode)", () => {
  it("only mocks when the flag is explicitly enabled", async () => {
    vi.stubEnv("BOLIGSIDEN_SALES_MOCK_MODE", "true");
    const first = await lookupBoligsidenSales(LAT, LON);
    const second = await lookupBoligsidenSales(LAT, LON);
    expect(first).toEqual(second);
    if (!first.ok) throw new Error("expected ok");
    expect(first.data.priceHistory.length).toBeGreaterThan(0);
    expect(first.data.nearbySales.length).toBeGreaterThan(0);
  });
});

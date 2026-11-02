import { describe, expect, it } from "vitest";
import type { HouseSearchEntry } from "@shared/types/house-search";
import { buildHusnummerUrl } from "@/lib/address-search";
import { isDanishPoint, parseHusnummerLocation } from "@/lib/house-search-geocode";
import {
  EMPTY_FORM,
  isRealIsoDate,
  parseDanishInteger,
  parseEntryForm,
  toIsoDate,
  withLocation,
  type EntryFormValues,
} from "@/lib/house-search-schema";
import { median, percentile, priceBandWidth, summarize } from "@/lib/house-search-stats";
import { entryBounds, entryWeight, toFeatureCollection } from "@/lib/house-search-heatmap";
import { applyFilters, hasActiveFilters, NO_FILTERS, parseFilters, serializeFilters } from "@/lib/house-search-filters";
import { HouseSearchError, inputToInsertRow, patchToUpdateRow, rowToEntry, rowToHousehold, toHouseSearchError, type EntryRow } from "@/lib/house-search-rows";

const ID = "0a3f50a0-1111-32b8-e044-0003ba298018";

function entry(overrides: Partial<HouseSearchEntry> = {}): HouseSearchEntry {
  return {
    id: crypto.randomUUID(),
    householdId: "h1",
    createdBy: "u1",
    husnummerId: ID,
    addressLabel: "Testvej 1, 9000 Aalborg",
    postalCode: "9000",
    lat: 57.04,
    lon: 9.92,
    seenAt: "2026-10-01",
    askingPriceDkk: 3_000_000,
    rooms: 4,
    status: "interested",
    rating: null,
    notes: "",
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

const validForm = (overrides: Partial<EntryFormValues> = {}): EntryFormValues => ({
  ...EMPTY_FORM,
  husnummerId: ID,
  addressLabel: "Testvej 1, 9000 Aalborg",
  seenAt: "2026-10-15",
  ...overrides,
});

describe("house search form parsing", () => {
  it("accepts Danish thousand separators and a trailing kr", () => {
    expect(parseDanishInteger("3.495.000")).toBe(3_495_000);
    expect(parseDanishInteger("3 495 000")).toBe(3_495_000);
    expect(parseDanishInteger("3 495 000 kr.")).toBe(3_495_000);
    expect(parseDanishInteger("2500000kr")).toBe(2_500_000);
  });

  it("rejects decimals, mio and junk instead of guessing", () => {
    // "3.5" must not become 35 (dot read as a separator), nor "3,5 mio" become 3.
    for (const bad of ["3,5 mio", "3.5", "3.49.000", "3.4950", "abc", "", "-5", "1e6", "12 34"]) {
      expect(parseDanishInteger(bad), bad).toBeNull();
    }
  });

  it("flags a price that is implausibly small for a house", () => {
    const parsed = parseEntryForm(validForm({ price: "3500" }));
    expect(parsed).toEqual({ ok: false, errors: { price: "outOfRange" } });
    expect(parseEntryForm(validForm({ price: "3500000" })).ok).toBe(true);
  });

  it("validates calendar dates, including impossible ones", () => {
    expect(isRealIsoDate("2026-02-28")).toBe(true);
    expect(isRealIsoDate("2024-02-29")).toBe(true);
    expect(isRealIsoDate("2026-02-29")).toBe(false);
    expect(isRealIsoDate("2026-13-01")).toBe(false);
    expect(isRealIsoDate("15-10-2026")).toBe(false);
  });

  it("formats the local date without shifting the day", () => {
    expect(toIsoDate(new Date(2026, 0, 5, 0, 30))).toBe("2026-01-05");
    expect(toIsoDate(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });

  it("parses a complete valid form", () => {
    const parsed = parseEntryForm(validForm({ price: "3.250.000", rooms: "5", rating: "4", status: "visited", notes: " nice garden " }));
    expect(parsed).toEqual({
      ok: true,
      input: {
        husnummerId: ID,
        addressLabel: "Testvej 1, 9000 Aalborg",
        seenAt: "2026-10-15",
        askingPriceDkk: 3_250_000,
        rooms: 5,
        status: "visited",
        rating: 4,
        notes: "nice garden",
      },
    });
  });

  it("treats price, rooms and rating as optional", () => {
    const parsed = parseEntryForm(validForm());
    expect(parsed.ok && parsed.input).toMatchObject({ askingPriceDkk: null, rooms: null, rating: null });
  });

  it("requires a picked address, not just typed text", () => {
    expect(parseEntryForm(validForm({ husnummerId: "" }))).toEqual({ ok: false, errors: { address: "required" } });
    expect(parseEntryForm(validForm({ husnummerId: "not-a-uuid" }))).toMatchObject({ ok: false });
  });

  it("reports every invalid field at once", () => {
    const parsed = parseEntryForm(validForm({ seenAt: "2026-02-30", price: "x", rooms: "0", rating: "6", status: "nope", notes: "n".repeat(2001) }));
    expect(parsed).toEqual({
      ok: false,
      errors: { seenAt: "invalidDate", price: "invalidNumber", rooms: "outOfRange", rating: "outOfRange", status: "required", notes: "tooLong" },
    });
  });

  it("merges the resolved location into the database input", () => {
    const parsed = parseEntryForm(validForm());
    if (!parsed.ok) throw new Error("expected a valid form");
    expect(withLocation(parsed.input, { lat: 57, lon: 10, postalCode: "9000" })).toMatchObject({ lat: 57, lon: 10, postalCode: "9000" });
  });
});

describe("house search geocoding", () => {
  it("builds the husnummer URL with the encoded id and token", () => {
    const url = new URL(buildHusnummerUrl(ID));
    expect(url.pathname).toBe(`/husnumre/${ID}`);
    expect(url.searchParams.get("token")?.length).toBeGreaterThanOrEqual(10);
  });

  it("converts the EPSG:25832 access point to WGS84 and reads the postcode", () => {
    // Aalborg city centre, about 57.048 N 9.919 E.
    const parsed = parseHusnummerLocation({ husnummer: { adgangspunkt: { koordinater: { x: 553_700, y: 6_325_000 } }, postnummer: { postnr: "9000" } } });
    expect(parsed?.postalCode).toBe("9000");
    expect(parsed?.lat).toBeGreaterThan(56.9);
    expect(parsed?.lat).toBeLessThan(57.2);
    expect(parsed?.lon).toBeGreaterThan(9.7);
    expect(parsed?.lon).toBeLessThan(10.1);
  });

  it("keeps the entry but drops the point when coordinates are missing or outside Denmark", () => {
    expect(parseHusnummerLocation({ husnummer: { postnummer: { postnr: "9000" } } })).toEqual({ lat: null, lon: null, postalCode: "9000" });
    // Swapped axes land far outside Denmark.
    expect(parseHusnummerLocation({ husnummer: { adgangspunkt: { koordinater: { x: 6_325_000, y: 553_700 } } } })).toMatchObject({ lat: null, lon: null });
  });

  it("returns null for a body that is not a husnummer", () => {
    expect(parseHusnummerLocation(null)).toBeNull();
    expect(parseHusnummerLocation({})).toBeNull();
    expect(parseHusnummerLocation([])).toBeNull();
  });

  it("knows Denmark's bounds", () => {
    expect(isDanishPoint(55.68, 12.57)).toBe(true);
    expect(isDanishPoint(55.1, 14.9)).toBe(true);
    expect(isDanishPoint(48.8, 2.3)).toBe(false);
  });
});

describe("house search statistics", () => {
  it("computes medians and percentiles, empty-safe", () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([1, 3, 2, 4])).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50], 0.25)).toBe(20);
    expect(percentile([10, 20, 30, 40, 50], 0.75)).toBe(40);
  });

  it("summarizes an empty list without dividing by zero", () => {
    const s = summarize([]);
    expect(s).toMatchObject({ total: 0, price: null, medianRooms: null, sweetSpot: null, rejectedVsKept: null });
    expect(s.priceBands).toEqual([]);
  });

  it("counts, ranges and groups the basics", () => {
    const s = summarize([
      entry({ askingPriceDkk: 2_000_000, rooms: 3, postalCode: "9000", seenAt: "2026-09-10" }),
      entry({ askingPriceDkk: 3_000_000, rooms: 4, postalCode: "9000", seenAt: "2026-10-02", status: "visited" }),
      entry({ askingPriceDkk: 4_000_000, rooms: 4, postalCode: "9200", seenAt: "2026-10-20", status: "rejected" }),
      entry({ askingPriceDkk: null, rooms: null, postalCode: null, lat: null, lon: null, seenAt: "2026-10-21" }),
    ]);
    expect(s.total).toBe(4);
    expect(s.withPrice).toBe(3);
    expect(s.withRooms).toBe(3);
    expect(s.withLocation).toBe(3);
    expect(s.price).toEqual({ min: 2_000_000, max: 4_000_000, median: 3_000_000 });
    expect(s.medianRooms).toBe(4);
    expect(s.byStatus).toEqual({ interested: 2, visited: 1, rejected: 1 });
    expect(s.roomsDistribution).toEqual([{ rooms: 3, count: 1 }, { rooms: 4, count: 2 }]);
    expect(s.byPostalCode.map((p) => [p.postalCode, p.count])).toEqual([["9000", 2], ["9200", 1]]);
    expect(s.byPostalCode[0]!.medianPrice).toBe(2_500_000);
    expect(s.byMonth).toEqual([{ month: "2026-09", count: 1 }, { month: "2026-10", count: 3 }]);
  });

  it("puts every priced listing in exactly one band", () => {
    const prices = [1_900_000, 2_000_000, 2_600_000, 3_999_999, 4_000_000, 5_500_000];
    const s = summarize(prices.map((askingPriceDkk) => entry({ askingPriceDkk })));
    expect(s.priceBands.reduce((sum, b) => sum + b.count, 0)).toBe(prices.length);
    expect(s.priceBands[0]!.from).toBeLessThanOrEqual(1_900_000);
    expect(s.priceBands.at(-1)!.to).toBeGreaterThan(5_500_000);
    expect(priceBandWidth(2_000_000, 3_000_000)).toBe(250_000);
    expect(priceBandWidth(2_000_000, 6_000_000)).toBe(500_000);
    expect(priceBandWidth(2_000_000, 12_000_000)).toBe(1_000_000);
  });

  it("refuses to call a handful of ratings a preference", () => {
    const liked = (n: number) => Array.from({ length: n }, () => entry({ rating: 5 }));
    expect(summarize(liked(2)).sweetSpot).toBeNull();
    expect(summarize(liked(2)).likedCount).toBe(2);
    expect(summarize(liked(3)).sweetSpot).not.toBeNull();
  });

  it("finds the middle half of what was rated 4 or 5, ignoring rejected ones", () => {
    const s = summarize([
      entry({ rating: 5, askingPriceDkk: 3_000_000, rooms: 4, postalCode: "9000" }),
      entry({ rating: 4, askingPriceDkk: 3_400_000, rooms: 5, postalCode: "9000" }),
      entry({ rating: 4, askingPriceDkk: 3_800_000, rooms: 5, postalCode: "9200" }),
      entry({ rating: 5, askingPriceDkk: 9_000_000, rooms: 9, status: "rejected" }),
      entry({ rating: 2, askingPriceDkk: 1_000_000, rooms: 2 }),
    ]);
    expect(s.sweetSpot?.count).toBe(3);
    expect(s.sweetSpot?.price).toEqual({ low: 3_200_000, median: 3_400_000, high: 3_600_000 });
    expect(s.sweetSpot?.rooms?.median).toBe(5);
    expect(s.sweetSpot?.topPostalCode).toBe("9000");
  });

  it("compares rejected with kept only when both exist", () => {
    expect(summarize([entry(), entry()]).rejectedVsKept).toBeNull();
    expect(summarize([entry({ status: "rejected" })]).rejectedVsKept).toBeNull();
    const s = summarize([
      entry({ askingPriceDkk: 3_000_000, rooms: 4 }),
      entry({ askingPriceDkk: 6_000_000, rooms: 7, status: "rejected" }),
    ]);
    expect(s.rejectedVsKept).toEqual({
      rejected: { count: 1, medianPrice: 6_000_000, medianRooms: 7 },
      kept: { count: 1, medianPrice: 3_000_000, medianRooms: 4 },
    });
  });
});

describe("house search heatmap data", () => {
  it("weights every listing equally in count mode", () => {
    expect(entryWeight({ status: "rejected", rating: 1 }, "count")).toBe(1);
    expect(entryWeight({ status: "interested", rating: null }, "count")).toBe(1);
  });

  it("weights by interest: rating scales, rejected barely counts, unrated is lukewarm", () => {
    expect(entryWeight({ status: "visited", rating: 5 }, "interest")).toBe(1);
    expect(entryWeight({ status: "interested", rating: 2 }, "interest")).toBe(0.4);
    expect(entryWeight({ status: "interested", rating: null }, "interest")).toBe(0.5);
    expect(entryWeight({ status: "rejected", rating: 5 }, "interest")).toBe(0.1);
  });

  it("emits GeoJSON as [lon, lat] and leaves out unlocated entries", () => {
    const located = entry({ lat: 57.04, lon: 9.92, rating: 3 });
    const unlocated = entry({ lat: null, lon: null });
    const fc = toFeatureCollection([located, unlocated], "interest");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.geometry.coordinates).toEqual([9.92, 57.04]);
    expect(fc.features[0]!.properties).toMatchObject({ id: located.id, weight: 0.6, price: 3_000_000, rooms: 4 });
  });

  it("bounds the located entries, or null when none are", () => {
    expect(entryBounds([entry({ lat: null, lon: null })])).toBeNull();
    expect(entryBounds([entry({ lat: 57, lon: 9 }), entry({ lat: 56, lon: 10 })])).toEqual([9, 56, 10, 57]);
  });
});

describe("house search filters", () => {
  it("round-trips through the URL and keeps unrelated params", () => {
    const filters = { statuses: ["visited", "rejected"] as const, from: "2026-09-01", to: "2026-10-31" };
    const params = serializeFilters({ ...filters, statuses: [...filters.statuses] }, new URLSearchParams("tab=map&status=old"));
    expect(params.get("tab")).toBe("map");
    expect(parseFilters(params)).toEqual({ ...filters, statuses: [...filters.statuses] });
  });

  it("writes a clean URL when there are no filters", () => {
    expect(serializeFilters(NO_FILTERS).toString()).toBe("");
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
  });

  it("drops malformed URL values instead of trusting them", () => {
    expect(parseFilters(new URLSearchParams("status=visited,bogus,visited&from=nonsense&to=2026-02-31"))).toEqual({
      statuses: ["visited"],
      from: null,
      to: null,
    });
  });

  it("filters by status and an inclusive date range", () => {
    const entries = [
      entry({ seenAt: "2026-09-30", status: "interested" }),
      entry({ seenAt: "2026-10-01", status: "visited" }),
      entry({ seenAt: "2026-10-31", status: "visited" }),
      entry({ seenAt: "2026-11-01", status: "rejected" }),
    ];
    expect(applyFilters(entries, NO_FILTERS)).toHaveLength(4);
    expect(applyFilters(entries, { statuses: ["visited"], from: null, to: null })).toHaveLength(2);
    expect(applyFilters(entries, { statuses: [], from: "2026-10-01", to: "2026-10-31" }).map((e) => e.seenAt)).toEqual(["2026-10-01", "2026-10-31"]);
  });
});

describe("house search database mapping", () => {
  const row: EntryRow = {
    id: "e1", household_id: "h1", created_by: "u1", husnummer_id: ID, address_label: "Testvej 1, 9000 Aalborg",
    postal_code: "9000", lat: 57.04, lon: 9.92, seen_at: "2026-10-01", asking_price_dkk: 3_000_000, rooms: 4,
    status: "visited", rating: 5, notes: "garden", created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-02T10:00:00Z",
  };

  it("maps a row to an entry and back to an insert row without losing fields", () => {
    const entry = rowToEntry(row);
    expect(entry).toMatchObject({ householdId: "h1", husnummerId: ID, askingPriceDkk: 3_000_000, seenAt: "2026-10-01", rating: 5 });
    const insert = inputToInsertRow(
      { husnummerId: entry.husnummerId, addressLabel: entry.addressLabel, postalCode: entry.postalCode, lat: entry.lat, lon: entry.lon, seenAt: entry.seenAt, askingPriceDkk: entry.askingPriceDkk, rooms: entry.rooms, status: entry.status, rating: entry.rating, notes: entry.notes },
      "h1",
      "u1",
    );
    expect(insert).toEqual({
      household_id: "h1", created_by: "u1", husnummer_id: ID, address_label: row.address_label, postal_code: "9000", lat: 57.04, lon: 9.92,
      seen_at: "2026-10-01", asking_price_dkk: 3_000_000, rooms: 4, status: "visited", rating: 5, notes: "garden",
    });
  });

  it("only lets the editable fields change on update, never the address or location", () => {
    const update = patchToUpdateRow({ seenAt: "2026-11-01", askingPriceDkk: null, rooms: 3, status: "rejected", rating: null, notes: "" });
    expect(Object.keys(update).sort()).toEqual(["asking_price_dkk", "notes", "rating", "rooms", "seen_at", "status"]);
    expect(update.asking_price_dkk).toBeNull();
  });

  it("maps a household row", () => {
    expect(rowToHousehold({ id: "h1", name: "Hansen", invite_code: "ABC123ABC123" })).toEqual({ id: "h1", name: "Hansen", inviteCode: "ABC123ABC123" });
  });

  it("turns database errors into stable codes without leaking the raw message to the UI", () => {
    expect(toHouseSearchError({ code: "P0002", message: "invalid invite code" }).code).toBe("invalidCode");
    expect(toHouseSearchError({ code: "54000", message: "household is full" }).code).toBe("householdFull");
    expect(toHouseSearchError({ code: "23505", message: "already in a household" }).code).toBe("alreadyMember");
    expect(toHouseSearchError({ code: "23505", message: 'duplicate key value violates unique constraint "house_search_entries_household_id_husnummer_id_seen_at_key"' }).code).toBe("duplicate");
    expect(toHouseSearchError({ code: "XX000", message: "boom" })).toBeInstanceOf(HouseSearchError);
    expect(toHouseSearchError({ code: "XX000", message: "boom" }).code).toBe("unknown");
    expect(toHouseSearchError(null).code).toBe("unknown");
  });
});

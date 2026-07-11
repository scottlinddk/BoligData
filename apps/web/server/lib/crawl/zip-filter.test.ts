import { afterEach, describe, expect, it } from "vitest";
import { filterByZipRange, getZipRange, isInZipRange } from "./map-utils";
import type { RawListing } from "./types";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function listing(postal_code: string | null): RawListing {
  return {
    address: "Testvej 1",
    municipality: "Aalborg",
    postal_code,
    price: 1000000,
    sqm: 80,
    listing_date: "2026-01-01",
    listing_source: "boliga",
    external_id: postal_code ?? "none",
    lat: 57,
    lon: 9.9,
    status: "active",
    building_year: null,
    property_type: "other",
    rooms: null,
    images: [],
    description: null,
    agent_name: null,
  };
}

describe("getZipRange", () => {
  it("defaults to 9000-9900", () => {
    delete process.env.CRAWL_ZIP_MIN;
    delete process.env.CRAWL_ZIP_MAX;
    expect(getZipRange()).toEqual({ min: 9000, max: 9900 });
  });

  it("is overridable via env vars", () => {
    process.env.CRAWL_ZIP_MIN = "1000";
    process.env.CRAWL_ZIP_MAX = "1499";
    expect(getZipRange()).toEqual({ min: 1000, max: 1499 });
  });

  it("swaps min/max if given in the wrong order", () => {
    process.env.CRAWL_ZIP_MIN = "9900";
    process.env.CRAWL_ZIP_MAX = "9000";
    expect(getZipRange()).toEqual({ min: 9000, max: 9900 });
  });
});

describe("isInZipRange", () => {
  const range = { min: 9000, max: 9900 };

  it("accepts postal codes within the range, inclusive of both ends", () => {
    expect(isInZipRange("9000", range)).toBe(true);
    expect(isInZipRange("9900", range)).toBe(true);
    expect(isInZipRange("9500", range)).toBe(true);
  });

  it("rejects postal codes outside the range", () => {
    expect(isInZipRange("8999", range)).toBe(false);
    expect(isInZipRange("9901", range)).toBe(false);
    expect(isInZipRange("2300", range)).toBe(false);
  });

  it("rejects missing or malformed postal codes", () => {
    expect(isInZipRange(null, range)).toBe(false);
    expect(isInZipRange("abc", range)).toBe(false);
  });
});

describe("filterByZipRange", () => {
  it("keeps only listings within range and counts the rest as excluded", () => {
    const listings = [listing("9000"), listing("8000"), listing("9900"), listing(null)];
    const { kept, excluded } = filterByZipRange(listings, { min: 9000, max: 9900 });
    expect(kept.map((l) => l.postal_code)).toEqual(["9000", "9900"]);
    expect(excluded).toBe(2);
  });
});

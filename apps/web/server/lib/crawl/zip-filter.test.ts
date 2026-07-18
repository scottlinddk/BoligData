import { afterEach, describe, expect, it } from "vitest";
import { filterByZipRanges, getZipRanges, isInZipRange, parseZipRanges } from "./map-utils";
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

describe("parseZipRanges", () => {
  it("parses multiple comma-separated intervals, trimming whitespace", () => {
    expect(parseZipRanges("9000-9900, 6000-6600")).toEqual([
      { min: 9000, max: 9900 },
      { min: 6000, max: 6600 },
    ]);
  });

  it("swaps reversed pairs", () => {
    expect(parseZipRanges("9900-9000")).toEqual([{ min: 9000, max: 9900 }]);
  });

  it("clamps out-of-bounds values to the valid postal-code span", () => {
    expect(parseZipRanges("0-500")).toEqual([{ min: 1000, max: 1000 }]);
  });

  it("skips malformed tokens", () => {
    expect(parseZipRanges("9000-9900, garbage, 6000-6600")).toEqual([
      { min: 9000, max: 9900 },
      { min: 6000, max: 6600 },
    ]);
  });

  it("returns an empty array for blank input", () => {
    expect(parseZipRanges("")).toEqual([]);
  });
});

describe("getZipRanges", () => {
  it("defaults to a single 9000-9900 range", () => {
    delete process.env.CRAWL_ZIP_RANGES;
    delete process.env.CRAWL_ZIP_MIN;
    delete process.env.CRAWL_ZIP_MAX;
    expect(getZipRanges()).toEqual([{ min: 9000, max: 9900 }]);
  });

  it("is overridable via the legacy single-range env vars", () => {
    delete process.env.CRAWL_ZIP_RANGES;
    process.env.CRAWL_ZIP_MIN = "1000";
    process.env.CRAWL_ZIP_MAX = "1499";
    expect(getZipRanges()).toEqual([{ min: 1000, max: 1499 }]);
  });

  it("swaps min/max if given in the wrong order", () => {
    delete process.env.CRAWL_ZIP_RANGES;
    process.env.CRAWL_ZIP_MIN = "9900";
    process.env.CRAWL_ZIP_MAX = "9000";
    expect(getZipRanges()).toEqual([{ min: 9000, max: 9900 }]);
  });

  it("prefers CRAWL_ZIP_RANGES over the legacy single-range env vars", () => {
    process.env.CRAWL_ZIP_RANGES = "9000-9900,6000-6600";
    process.env.CRAWL_ZIP_MIN = "1000";
    process.env.CRAWL_ZIP_MAX = "1499";
    expect(getZipRanges()).toEqual([
      { min: 9000, max: 9900 },
      { min: 6000, max: 6600 },
    ]);
  });
});

describe("isInZipRange", () => {
  const ranges = [
    { min: 9000, max: 9900 },
    { min: 6000, max: 6600 },
  ];

  it("accepts postal codes within any configured range, inclusive of both ends", () => {
    expect(isInZipRange("9000", ranges)).toBe(true);
    expect(isInZipRange("9900", ranges)).toBe(true);
    expect(isInZipRange("6300", ranges)).toBe(true);
    expect(isInZipRange("6600", ranges)).toBe(true);
  });

  it("rejects postal codes outside every configured range", () => {
    expect(isInZipRange("8999", ranges)).toBe(false);
    expect(isInZipRange("9901", ranges)).toBe(false);
    expect(isInZipRange("2300", ranges)).toBe(false);
  });

  it("rejects missing or malformed postal codes", () => {
    expect(isInZipRange(null, ranges)).toBe(false);
    expect(isInZipRange("abc", ranges)).toBe(false);
  });
});

describe("filterByZipRanges", () => {
  it("keeps only listings within any configured range and counts the rest as excluded", () => {
    const listings = [listing("9000"), listing("8000"), listing("6300"), listing(null)];
    const { kept, excluded } = filterByZipRanges(listings, [
      { min: 9000, max: 9900 },
      { min: 6000, max: 6600 },
    ]);
    expect(kept.map((l) => l.postal_code)).toEqual(["9000", "6300"]);
    expect(excluded).toBe(2);
  });
});

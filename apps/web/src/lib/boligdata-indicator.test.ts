import { describe, expect, it } from "vitest";
import { boligdataIndicator } from "./boligdata-indicator";

describe("boligdataIndicator", () => {
  it("averages SPAR and time on market with equal weight", () => {
    const result = boligdataIndicator({ sparPriceDkk: 3_000_000, timeOnMarketPriceDkk: 3_400_000 });
    expect(result?.priceDkk).toBe(3_200_000);
    expect(result?.sources.map(source => source.key)).toEqual(["spar", "timeOnMarket"]);
    expect(result?.lowDkk).toBe(3_000_000);
    expect(result?.highDkk).toBe(3_400_000);
  });

  it("rounds the headline to the nearest 10.000 kr.", () => {
    expect(boligdataIndicator({ sparPriceDkk: 3_004_000, timeOnMarketPriceDkk: 3_100_000 })?.priceDkk).toBe(3_050_000);
    expect(boligdataIndicator({ sparPriceDkk: 3_011_000, timeOnMarketPriceDkk: 3_100_000 })?.priceDkk).toBe(3_060_000);
  });

  it("gives no indicator from a single source", () => {
    expect(boligdataIndicator({ sparPriceDkk: 3_000_000 })).toBeNull();
    expect(boligdataIndicator({ timeOnMarketPriceDkk: 3_000_000 })).toBeNull();
    expect(boligdataIndicator({})).toBeNull();
  });

  it("ignores zero, negative and non-finite sources", () => {
    expect(boligdataIndicator({ sparPriceDkk: 0, timeOnMarketPriceDkk: 3_000_000 })).toBeNull();
    expect(boligdataIndicator({ sparPriceDkk: Number.NaN, timeOnMarketPriceDkk: 3_000_000 })).toBeNull();
    expect(boligdataIndicator({ sparPriceDkk: -1, timeOnMarketPriceDkk: 3_000_000 })).toBeNull();
  });

  it("compares the asking price to the indicator", () => {
    const result = boligdataIndicator({ sparPriceDkk: 3_000_000, timeOnMarketPriceDkk: 3_400_000, askingPriceDkk: 3_520_000 });
    expect(result?.askingVsIndicator).toBeCloseTo(0.1, 5);
    expect(boligdataIndicator({ sparPriceDkk: 3_000_000, timeOnMarketPriceDkk: 3_400_000 })?.askingVsIndicator).toBeNull();
  });

  it("reports how far apart the methods are", () => {
    const result = boligdataIndicator({ sparPriceDkk: 3_000_000, timeOnMarketPriceDkk: 3_400_000 });
    expect(result?.spreadRatio).toBeCloseTo(0.125, 5);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyBoligsidenOriginalAsking } from "./boligsiden-original-price.js";
import fixtures from "./fixtures/boligsiden-original-price.market-period.json";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime("2026-09-29T12:00:00Z"); });
afterEach(() => vi.useRealTimers());

const target = () => structuredClone(fixtures.find(row => row.name === "Bakkevænget 20")!);
const classify = (fixture: ReturnType<typeof target>) => classifyBoligsidenOriginalAsking({
  sourceListingId: fixture.sourceListingId, observedAt: fixture.observedAt,
}, fixture.address, fixture.timeline);

describe("original asking price across the total marketing period", () => {
  it.each(fixtures.filter(row => row.expected !== undefined))("matches independently checked live history: $name", fixture => {
    expect(classify(fixture)).toMatchObject({
      ...fixture.expected, priceScope: "total_marketing_period",
      totalDays: fixture.address.cases[0]!.timeOnMarket.total.days,
      latestEpisodeDays: fixture.address.cases[0]!.timeOnMarket.current.days,
    });
  });

  it("uses the 159-day first broker period despite the 18-day off-market gap", () => {
    const fixture = target();
    expect(classify(fixture)).toMatchObject({ status: "exact", price: 6_498_000, originalDate: "2025-09-30", totalDays: 346, latestEpisodeDays: 187 });
    // Both simple date cutoffs miss the original; the source's broker-period sum is needed.
    expect(new Date(Date.parse(fixture.observedAt) - 346 * 86_400_000).toISOString().slice(0, 10)).toBe("2025-10-18");
  });

  it.each(["346", -1, 345.5, NaN, Infinity, 36_501, 186, null, undefined])("rejects a malformed or contradictory total: %s", days => {
    const fixture = target();
    Object.assign(fixture.address.cases[0]!.timeOnMarket.total, { days });
    expect(classify(fixture)).toMatchObject({ status: "conflict", reason: "invalid_total_market_duration", price: null });
  });

  it("keeps legacy scope only when the total is absent", () => {
    const fixture = target();
    Reflect.deleteProperty(fixture.address.cases[0]!.timeOnMarket, "total");
    expect(classify(fixture)).toMatchObject({ status: "exact", price: 6_250_000, priceScope: "current_listing", totalDays: null });
  });

  it("does not use the current broker's opening when the total needs missing history", () => {
    const fixture = target(); fixture.timeline = fixture.timeline.filter(event => event.at >= "2026-03-26");
    expect(classify(fixture)).toMatchObject({ status: "missing", reason: "total_market_opening_missing", price: null });
  });

  it("requires exact agreement with the previous period's duration", () => {
    const fixture = target(); fixture.address.cases[0]!.timeOnMarket.total.days--;
    expect(classify(fixture)).toMatchObject({ status: "conflict", reason: "previous_period_exceeds_total_duration", price: null });
  });

  it("validates the first broker's closing price", () => {
    const fixture = target(); fixture.timeline.find(event => event.type === "closed")!.price = 6_400_000;
    expect(classify(fixture)).toMatchObject({ status: "conflict", reason: "inconsistent_previous_price_path", price: null });
  });

  it("does not cross a sale between brokers", () => {
    const fixture = target();
    fixture.timeline.push({ at: "2026-03-15T00:00:00Z", type: "sold", price: 6_300_000, aux: { type: "normal" } });
    expect(classify(fixture)).toMatchObject({ status: "conflict", reason: "sale_between_market_periods", price: null });
  });

  it("excludes older campaigns once the total duration has been accounted for", () => {
    const fixture = target();
    fixture.timeline.push(
      { at: "2021-01-01T00:00:00Z", type: "open", price: 8_000_000 },
      { at: "2021-02-01T00:00:00Z", type: "sold", price: 7_500_000, aux: { type: "normal" } },
    );
    expect(classify(fixture)).toMatchObject({ status: "exact", price: 6_498_000, originalDate: "2025-09-30" });
  });

  it("accounts for more than two brokers without including gaps", () => {
    const fixture = target(); fixture.address.cases[0]!.timeOnMarket.total.days += 90;
    fixture.timeline.push(
      { at: "2025-01-01T00:00:00Z", type: "open", price: 6_700_000 },
      { at: "2025-04-01T00:00:00Z", type: "closed", price: 6_700_000 },
    );
    expect(classify(fixture)).toMatchObject({ status: "exact", price: 6_700_000, originalDate: "2025-01-01", totalDays: 436 });
  });

  it("does not guess a price when the source duration clips a much older period", () => {
    const fixture = fixtures.find(row => row.name === "Hasserisvej 124B")!;
    expect(classify(fixture)).toMatchObject({ status: "conflict", reason: "previous_period_exceeds_total_duration", price: null });
  });

  it("supports a new listing with zero current and total days", () => {
    const fixture = target();
    fixture.address.cases[0]!.timeOnMarket.current.days = 0;
    fixture.address.cases[0]!.timeOnMarket.total.days = 0;
    fixture.timeline = [{ at: "2026-09-29T06:00:00Z", type: "open", price: 5_795_000 }];
    expect(classify(fixture)).toMatchObject({ status: "exact", price: 5_795_000, priceScope: "total_marketing_period", totalDays: 0 });
  });

  it("does not select a later opening when an earlier zero-day broker period also fits", () => {
    const fixture = target();
    fixture.timeline.push(
      { at: "2025-09-30T00:00:00Z", type: "open", price: 6_700_000 },
      { at: "2025-09-30T01:00:00Z", type: "closed", price: 6_700_000 },
    );
    expect(classify(fixture)).toMatchObject({ status: "conflict", reason: "ambiguous_zero_day_market_period", price: null });
  });
});

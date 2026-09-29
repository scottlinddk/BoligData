import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Property } from "@shared/types/index";
import type { ResearchEvent, ResearchHistoryResponse, ResearchObservation } from "@shared/types/research-api";
import { WorkbookPriceReferenceCard } from "@/components/research/workbook-price-reference";
import { workbookListingReference } from "./workbook-listing-reference";

const i18n = vi.hoisted(() => ({ language: "da" }));
vi.mock("@/i18n/i18n", () => ({ useI18n: () => i18n }));

const NOW = "2026-09-27T12:00:00.000Z";
const startDate = new Date(Date.parse(NOW) - 188 * 86_400_000).toISOString().slice(0, 10);
const property = {
  id: "subject", address: "Testvej 1", dataMode: "real", status: "active", propertyType: "villa", postalCode: "9000",
  municipality: "Aalborg", listingSource: "boligsiden", externalId: "case-1", listingDate: startDate,
  price: 5_200_000, firstSeenAt: "2026-09-20T12:00:00.000Z", updatedAt: NOW,
} as Property;
const first: ResearchEvent = {
  id: "first", propertyId: property.id, campaignId: "campaign", episodeId: "episode", eventType: "first_listing",
  eventDate: startDate, eventDateEnd: null, datePrecision: "day", price: 5_500_000,
  source: "boligsiden", sourceUrl: null, observedAt: NOW, dataMode: "real",
};
const history = (overrides: Partial<ResearchHistoryResponse> = {}): ResearchHistoryResponse => ({
  campaigns: [{ id: "campaign", propertyId: property.id, source: "boligsiden", sourceUrl: null, linkReason: "Same source case", observedAt: NOW }],
  episodes: [{ id: "episode", propertyId: property.id, campaignId: "campaign", source: "boligsiden", sourceListingId: "case-1",
    sourceUrl: null, startDate, endDate: null, datePrecision: "day", status: "active", agentName: null, observedAt: NOW, dataMode: "real" }],
  events: [first], transactions: [], observations: [], conditionEvidence: [], dataVersion: "fixture/1", retrievedAt: NOW, truncated: false,
  ...overrides,
});
const askingChange: ResearchObservation = {
  id: "price-change", propertyId: property.id, episodeId: "episode", fieldName: "asking_price_change",
  value: { currentAsking: property.price, changePercent: -5.45 }, source: "boligsiden", sourceUrl: null,
  effectiveDate: NOW.slice(0, 10), datePrecision: "day", observedAt: NOW, method: "source_reported_price_change",
  verificationStatus: "unverified", dataMode: "real", sourceFile: null, sourceSheet: null, sourceRow: null,
  sourceVersion: null, conflictGroup: null,
};
const exactOriginal: ResearchObservation = {
  ...askingChange, id: "exact-original", fieldName: "original_asking_price", method: "source_reported_original_asking",
  effectiveDate: null, datePrecision: "unknown",
  value: { price: 5_500_000, sourceListingId: property.externalId, scope: "listing", originalDate: null },
};
const render = (overrides: Partial<Parameters<typeof WorkbookPriceReferenceCard>[0]> = {}) => renderToStaticMarkup(createElement(WorkbookPriceReferenceCard, {
  property, history: history(), loading: false, failed: false, onRetry: () => {}, ...overrides,
}));

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)); i18n.language = "da"; });
afterEach(() => vi.useRealTimers());

describe("source-reported original asking integration", () => {
  it("uses exact original evidence before approximate percentage recovery, without making a first-listing date", () => {
    const data = history({ events: [], observations: [askingChange, exactOriginal] });
    const result = workbookListingReference(property, data);
    expect(result.reference).toMatchObject({ status: "available", referencePrice: 4_810_000, baselinePrice: 5_500_000 });
    expect(result.exactOriginal).toMatchObject({ price: 5_500_000, originalDate: null });
    expect(result.estimatedFirst).toBeNull();
    expect(result.listing.firstAsking).toBeNull();
    expect(result.listing.time.firstDocumentedListing).toBeNull();
  });

  it("keeps a complete exact price usable when routine history reaches its response cap", () => {
    const data = history({ truncated: true, events: [], observations: [], originalAskingEvidence: {
      propertyId: property.id, complete: true, observations: [exactOriginal],
    } });
    const result = workbookListingReference(property, data);
    expect(result.reference).toMatchObject({ status: "available", referencePrice: 4_810_000 });
    expect(result.estimatedFirst).toBeNull();
    const html = render({ history: data });
    expect(html).toContain("4.810.000");
    expect(html).toContain("hentet som særskilt kildeoplysning");
    expect(html).toContain('data-testid="workbook-exact-original-source"');
    expect(html).not.toContain("Den oprindelige udbudspris kan ikke fastslås");
  });

  it("does not upgrade unknown listing provenance or invent duration from exact price evidence", () => {
    const input = { ...property, dataMode: "unknown" as const, listingDate: null };
    const data = history({ events: [], observations: [exactOriginal] });
    const result = workbookListingReference(input, data);
    expect(result.reference).toMatchObject({ status: "available", referencePrice: 5_170_000, timeBasis: "all_sales" });
    expect(result.listing.time.latestEpisodeDays).toBeNull();
    const html = render({ property: input, history: data });
    expect(html).toContain("5.170.000");
    expect(html).toContain("Øvrige annonceoplysninger er endnu ikke bekræftet");
  });

  it("retains conflicts between exact source amounts and documented originals", () => {
    for (const events of [[{ ...first, price: 6_000_000 }], [first, { ...first, id: "conflicting", price: 6_000_000 }]]) {
      const result = workbookListingReference(property, history({ events, observations: [exactOriginal, askingChange] }));
      expect(result.reference.status).toBe("missing_first_asking");
      expect(result.originalPriceConflict).toBe(true);
      expect(result.estimatedFirst).toBeNull();
      expect(result.exactOriginal).toBeNull();
    }
  });

  it("does not compare a prior episode's campaign original with the current listing's exact original", () => {
    const data = history({ events: [{ ...first, episodeId: "previous-episode", eventDate: "2025-01-01", price: 6_000_000 }],
      observations: [exactOriginal] });
    data.episodes.push({ ...data.episodes[0]!, id: "previous-episode", sourceListingId: "previous-case", startDate: "2025-01-01",
      endDate: "2025-06-01", status: "removed" });
    const result = workbookListingReference(property, data);
    expect(result.listing.firstAsking).toBe(6_000_000);
    expect(result.firstAsking).toBe(5_500_000);
    expect(result.originalPriceConflict).toBe(false);
    expect(result.reference).toMatchObject({ status: "available", referencePrice: 4_810_000 });
  });

  it("compares precise originals only on the same date, while preserving an explicitly undated same-episode conflict", () => {
    const dated = { ...exactOriginal, effectiveDate: startDate, datePrecision: "day" as const,
      value: { ...exactOriginal.value as Record<string, unknown>, originalDate: startDate } };
    const differentDate = history({ events: [{ ...first, eventDate: "2025-01-01", price: 6_000_000 }], observations: [dated] });
    expect(workbookListingReference(property, differentDate).firstAsking).toBe(5_500_000);
    for (const event of [{ ...first, price: 6_000_000 }, { ...first, eventDate: null, datePrecision: "unknown" as const, price: 6_000_000 }]) {
      const result = workbookListingReference(property, history({ events: [event], observations: [dated] }));
      expect(result.originalPriceConflict).toBe(true);
      expect(result.firstAsking).toBeNull();
    }
  });

  it("does not use a percentage behind invalid or conflicting newest exact evidence", () => {
    for (const observation of [{ ...exactOriginal, verificationStatus: "conflict" as const }, { ...exactOriginal, method: "unknown" }]) {
      const result = workbookListingReference(property, history({ events: [], observations: [askingChange, observation] }));
      expect(result.reference.status).toBe("missing_first_asking");
      expect(result.estimatedFirst).toBeNull();
    }
  });

  it("shows exact provenance and an unknown original date in both languages", () => {
    const data = history({ events: [], observations: [exactOriginal] });
    expect(render({ history: data })).toContain("Den oprindelige udbudsdato er ikke oplyst");
    i18n.language = "en";
    const html = render({ history: data });
    expect(html).toContain("Source-reported original asking price");
    expect(html).toContain("The original listing date is not provided");
    expect(html).not.toContain("Estimated original asking price");
  });

  it("labels retained current-agent originals explicitly without changing the workbook calculation", () => {
    const observation = { ...exactOriginal, sourceVersion: "original-price-backfill/v1", effectiveDate: startDate, datePrecision: "day" as const,
      value: { ...exactOriginal.value as Record<string, unknown>, originalDate: startDate } };
    const data = history({ events: [], observations: [observation] });
    const result = workbookListingReference(property, data);
    expect(result.exactOriginal).toMatchObject({ price: 5_500_000, priceScope: "current_listing" });
    expect(result.reference).toEqual(workbookListingReference(property, history({ events: [], observations: [exactOriginal] })).reference);
    const da = render({ history: data });
    expect(da).toContain("Oprindelig pris hos nuværende mægler");
    expect(da).toContain("Udbudsdato hos nuværende mægler");
    expect(da).toContain("hele udbudsforløbet er endnu ikke dokumenteret");
    expect(da).not.toContain("Oprindelig udbudspris oplyst af kilden");
    i18n.language = "en";
    const en = render({ history: data });
    expect(en).toContain("Original price with current agent");
    expect(en).toContain("Listing date with current agent");
    expect(en).not.toContain("Source-reported original asking price");
  });

  it("keeps the original-asking label for a verified total marketing period", () => {
    const data = history({ events: [], observations: [{ ...exactOriginal, sourceVersion: "original-price-backfill/v2",
      effectiveDate: startDate, datePrecision: "day", value: { ...exactOriginal.value as Record<string, unknown>,
        originalDate: startDate, priceScope: "total_marketing_period", totalDays: 188 } }] });
    const da = render({ history: data });
    expect(da).toContain("Oprindelig udbudspris");
    expect(da).not.toContain("Oprindelig pris hos nuværende mægler");
    i18n.language = "en";
    const en = render({ history: data });
    expect(en).toContain("Source-reported original asking price");
    expect(en).not.toContain("Original price with current agent");
  });
});

describe("listing workbook reference integration", () => {
  it("uses the documented first asking price, not another discount on the current asking price", () => {
    const result = workbookListingReference(property, history());
    expect(result.reference).toMatchObject({ status: "available", referencePrice: 4_810_000, lowerPrice: 4_660_000, upperPrice: 5_080_000, gapAmount: 390_000, priceBasis: "first_asking", timeBasis: "matched_bracket", baselinePrice: 5_500_000 });
    expect(result.listing.time.latestEpisodeDays).toBe(188);
    expect(result.firstAsking).toBe(5_500_000);
    expect(result.estimatedFirst).toBeNull();
    expect(result.lastSourceCheck).toBe(NOW);
    expect(result.stale).toBe(false);
  });

  it("does not derive the first asking price from the crawler's first observation", () => {
    const result = workbookListingReference(property, history({ events: [{ ...first, eventType: "observation", price: property.price, eventDate: null, datePrecision: "unknown" }] }));
    expect(result.firstAsking).toBeNull();
    expect(result.reference).toMatchObject({ status: "missing_first_asking", referencePrice: null, baselinePrice: null, bracket: { count: 22 } });
  });

  it("does not choose among conflicting originals or substitute today's price", () => {
    const result = workbookListingReference(property, history({ events: [first, { ...first, id: "conflict", price: 6_000_000 }], observations: [askingChange] }));
    expect(result.reference).toMatchObject({ status: "missing_first_asking", referencePrice: null, baselinePrice: null });
    expect(result.firstAsking).toBeNull();
    expect(result.estimatedFirst).toBeNull();
  });

  it("retains the time group without backdating today's price when history is unavailable", () => {
    const result = workbookListingReference(property);
    expect(result.reference).toMatchObject({ status: "missing_first_asking", referencePrice: null, gapAmount: null, baselinePrice: null });
    expect(result.reference.bracket?.count).toBe(22);
    expect(result.listing.time.latestEpisodeDays).toBe(188);
    expect(result.firstAsking).toBeNull();
    expect(result.listing.time.firstDocumentedListing).toBeNull();
    expect(result.estimatedFirst).toBeNull();
    expect(result.lastSourceCheck).toBeNull();
  });

  it("uses a labelled source-derived scenario when the first-listing event has no price", () => {
    const result = workbookListingReference(property, history({ events: [{ ...first, price: null }], observations: [askingChange] }));
    expect(result.reference).toMatchObject({ status: "available", referencePrice: 4_810_000, gapAmount: 390_000 });
    expect(result.firstAsking).toBeCloseTo(5_200_000 / (1 - 0.0545));
    expect(result.estimatedFirst).toMatchObject({ changePercent: -5.45, observedAt: NOW });
    expect(result.listing.firstAsking).toBeNull();
  });

  it("supports current listings with source-reported duration and price change but no invented start date", () => {
    const data = history({ events: [], observations: [askingChange, {
      ...askingChange, id: "duration", fieldName: "reported_time_on_market", method: "source_reported_duration",
      value: { latestEpisodeDays: 188, totalDays: 300 },
    }] });
    data.episodes[0] = { ...data.episodes[0]!, startDate: null, datePrecision: "unknown" };
    const result = workbookListingReference({ ...property, listingDate: null }, data);
    expect(result.reference.referencePrice).toBe(4_810_000);
    expect(result.listing.time.latestEpisodeDays).toBe(188);
    expect(result.listing.time.firstDocumentedListing).toBeNull();
    expect(result.listing.latestEpisodeSource?.observedAt).toBe(NOW);
  });

  it("keeps documented first prices authoritative over the reported percentage", () => {
    const result = workbookListingReference(property, history({ observations: [{ ...askingChange, value: { currentAsking: property.price, changePercent: -30 } }] }));
    expect(result.firstAsking).toBe(5_500_000);
    expect(result.estimatedFirst).toBeNull();
  });

  it("rejects a percentage attached to another episode or a different listing source", () => {
    for (const observation of [{ ...askingChange, episodeId: "old-episode" }, { ...askingChange, source: "boliga" }]) {
      const result = workbookListingReference(property, history({ events: [], observations: [observation] }));
      expect(result.reference).toMatchObject({ status: "missing_first_asking", referencePrice: null, baselinePrice: null });
      expect(result.firstAsking).toBeNull();
      expect(result.estimatedFirst).toBeNull();
    }
  });

  it("keeps the documented original and should-be price unchanged when today's price is reduced", () => {
    for (const price of [5_200_000, 4_900_000, 4_700_000]) {
      const result = workbookListingReference({ ...property, price }, history());
      expect(result.firstAsking).toBe(5_500_000);
      expect(result.reference).toMatchObject({ status: "available", referencePrice: 4_810_000, baselinePrice: 5_500_000, gapAmount: price - 4_810_000 });
    }
  });

  it("keeps the source-reconstructed original independent of subsequent current-price reductions", () => {
    const data = history({ events: [], observations: [askingChange] });
    for (const price of [5_200_000, 4_900_000, 4_700_000]) {
      const result = workbookListingReference({ ...property, price }, data);
      expect(result.firstAsking).toBeCloseTo(5_200_000 / .9455);
      expect(result.estimatedFirst).toMatchObject({ askingAtObservation: 5_200_000, changePercent: -5.45, observedAt: NOW });
      expect(result.reference).toMatchObject({ status: "available", referencePrice: 4_810_000, priceBasis: "first_asking", gapAmount: price - 4_810_000 });
      expect(result.listing.firstAsking).toBeNull();
    }
  });

  it.each([{ verificationStatus: "conflict" }, { value: { currentAsking: 4_900_000, changePercent: "unknown" } }])("does not revive an older source tuple when the newest evidence is invalid: %j", overrides => {
    const data = history({ events: [], observations: [
      { ...askingChange, id: "older", observedAt: "2026-09-26T12:00:00.000Z", effectiveDate: "2026-09-26" },
      { ...askingChange, ...overrides } as ResearchObservation,
    ] });
    const result = workbookListingReference({ ...property, price: 4_900_000 }, data);
    expect(result.firstAsking).toBeNull();
    expect(result.estimatedFirst).toBeNull();
    expect(result.reference).toMatchObject({ status: "missing_first_asking", referencePrice: null });
  });

  it("does not substitute firstSeenAt when both the listing date and episode start are unknown", () => {
    const data = history();
    data.episodes[0] = { ...data.episodes[0]!, startDate: null, datePrecision: "unknown" };
    const result = workbookListingReference({ ...property, listingDate: null }, data);
    expect(result.reference).toMatchObject({ status: "available", timeBasis: "all_sales", priceBasis: "first_asking", referencePrice: 5_170_000, bracket: { count: 281 } });
    expect(result.listing.time.latestEpisodeDays).toBeNull();
  });

  it("retains all-sales statistics without a monetary price when original and listing time are unknown", () => {
    const result = workbookListingReference({ ...property, listingDate: null });
    expect(result.reference).toMatchObject({ status: "missing_first_asking", baselinePrice: null, timeBasis: "all_sales", referencePrice: null, bracket: { count: 281 } });
    expect(result.firstAsking).toBeNull();
    expect(result.listing.time.latestEpisodeDays).toBeNull();
    expect(result.listing.time.firstDocumentedListing).toBeNull();
  });

  it("retains known latest listing time without substituting today's price for truncated original evidence", () => {
    const result = workbookListingReference(property, history({ truncated: true }));
    expect(result.reference).toMatchObject({ status: "missing_first_asking", referencePrice: null, baselinePrice: null });
    expect(result.listing.time.latestEpisodeDays).toBe(188);
    expect(result.firstAsking).toBeNull();
  });

  it.each(["demo", "mock", "unknown"] as const)("retains historical statistics for %s data without claiming an original asking price", dataMode => {
    const result = workbookListingReference({ ...property, dataMode }, history());
    expect(result.reference).toMatchObject({ status: "missing_first_asking", baselinePrice: null, timeBasis: "all_sales", referencePrice: null });
    expect(result.firstAsking).toBeNull();
    expect(result.listing.time.latestEpisodeDays).toBeNull();
    expect(result.lastSourceCheck).toBeNull();
  });

  it.each(["sold", "withdrawn"] as const)("does not use current-price fallback for %s listings", status => {
    const result = workbookListingReference({ ...property, status }, history());
    expect(result.reference).toMatchObject({ status: "missing_first_asking", baselinePrice: null, timeBasis: "all_sales", referencePrice: null });
    expect(result.firstAsking).toBeNull();
    expect(result.listing.time.latestEpisodeDays).toBeNull();
    expect(result.lastSourceCheck).toBeNull();
  });

  it("keeps history retrieval time separate from the last source check", () => {
    const data = history();
    const sourceDate = "2026-09-16T09:00:00.000Z";
    data.episodes[0] = { ...data.episodes[0]!, observedAt: sourceDate };
    expect(workbookListingReference(property, data)).toMatchObject({ lastSourceCheck: sourceDate, stale: true });
    data.episodes[0] = { ...data.episodes[0]!, sourceListingId: "old-case" };
    expect(workbookListingReference(property, data).lastSourceCheck).toBeNull();
  });

  it("does not claim a source check in the future", () => {
    const data = history();
    data.episodes[0] = { ...data.episodes[0]!, observedAt: "2026-10-01T09:00:00.000Z" };
    expect(workbookListingReference(property, data).lastSourceCheck).toBeNull();
  });

  it.each(["episode", "first_price", "retrieval", "campaign"])("excludes a same-day future %s observation while retaining pooled statistics", target => {
    const future = "2026-09-27T23:00:00.000Z";
    const data = history();
    if (target === "episode") data.episodes[0] = { ...data.episodes[0]!, observedAt: future };
    if (target === "first_price") data.events[0] = { ...first, observedAt: future };
    if (target === "retrieval") data.retrievedAt = future;
    if (target === "campaign") data.campaigns[0] = { ...data.campaigns[0]!, observedAt: future };
    const result = workbookListingReference(property, data);
    expect(result.invalidSourceTiming).toBe(true);
    expect(result.reference).toMatchObject({ status: "missing_first_asking", baselinePrice: null, timeBasis: "all_sales", referencePrice: null });
    expect(result.firstAsking).toBeNull();
    expect(result.estimatedFirst).toBeNull();
    expect(result.lastSourceCheck).toBeNull();
  });
});

describe("prominent price by time on market card", () => {
  it("shows the target, current asking price, gap, sample and source dates without opening a tab", () => {
    const html = render();
    expect(html).toContain('data-state="available"');
    expect(html).toContain("Pris efter liggetid");
    expect(html).toContain("Burde koste");
    expect(html).toContain("4.810.000");
    expect(html).toContain("5.200.000");
    expect(html).toContain("390.000");
    expect(html).toContain("over ‘Burde koste’");
    expect(html).toContain("281 historiske villasalg");
    expect(html).toContain("2026-09-27");
    expect(html).toContain("ikke en markedsvurdering");
    expect(html).toContain('data-testid="workbook-original-price-basis"');
    expect(html).toContain("Oprindelig udbudspris");
    expect(html).toContain("5.500.000");
    expect(html).not.toContain('data-testid="workbook-current-price-basis"');
    expect(html.indexOf('data-testid="workbook-target-price"')).toBeLessThan(html.indexOf("<details"));
  });

  it("shows current asking and Burde koste together ahead of the evidence details", () => {
    const overview = render().split("<details")[0]!;
    expect(overview).toContain("Aktuel udbudspris");
    expect(overview).toContain("Burde koste");
    expect(overview).toContain('data-testid="workbook-current-asking"');
    expect(overview).toContain('data-testid="workbook-target-price"');
    expect(overview).toContain("5.200.000");
    expect(overview).toContain("4.810.000");
    expect(overview).toContain('data-comparison="above"');
    expect(overview).toContain("390.000");
    expect(overview).toContain("7,5 % af udbudsprisen");
    expect(overview).not.toContain("Bør-pris");
  });

  it.each([
    { price: 4_700_000, state: "below", amount: "110.000", percent: "2,3 %", label: "under ‘Burde koste’" },
    { price: 4_810_000, state: "equal", amount: "0 kr.", percent: "0 %", label: "på niveau med ‘Burde koste’" },
  ])("shows the $state amount and percentage without changing the original-based estimate", ({ price, state, amount, percent, label }) => {
    const html = render({ property: { ...property, price } });
    const comparison = html.split('data-testid="workbook-price-gap"')[1]!.split("</div>")[0]!.replace(/\s+/g, " ");
    expect(comparison).toContain(`data-comparison="${state}"`);
    expect(comparison).toContain(amount);
    expect(comparison).toContain(`${percent} af udbudsprisen`);
    expect(comparison).toContain(label);
    expect(comparison).not.toContain("-110.000");
    expect(html).toContain("4.810.000");
    expect(html).toContain("5.500.000");
  });

  it("keeps current asking visible with an explicit pending estimate when original evidence is missing", () => {
    const overview = render({ history: history({ events: [] }) }).split("<details")[0]!;
    expect(overview).toContain('data-testid="workbook-current-asking"');
    expect(overview).toContain("5.200.000");
    expect(overview).toContain("Burde koste");
    expect(overview).toContain("Afventer oprindelig udbudspris");
    expect(overview).not.toContain('data-testid="workbook-target-price"');
    expect(overview).not.toContain('data-testid="workbook-price-gap"');
  });

  it("retains the estimate with an explicit missing-current-price comparison state", () => {
    const overview = render({ property: { ...property, price: NaN } }).split("<details")[0]!;
    expect(overview).toContain('data-testid="workbook-current-asking"');
    expect(overview).toContain("Ukendt");
    expect(overview).toContain("4.810.000");
    expect(overview).toContain("Sammenligningen afventer en gyldig aktuel udbudspris");
    expect(overview).not.toContain('data-testid="workbook-price-gap"');
    expect(overview).not.toContain("NaN");
  });

  it.each([
    { price: 5_200_000, label: "above ‘Should cost’", amount: "390,000", percent: "7.5 %" },
    { price: 4_700_000, label: "below ‘Should cost’", amount: "110,000", percent: "2.3 %" },
    { price: 4_810_000, label: "in line with ‘Should cost’", amount: "DKK 0", percent: "0 %" },
  ])("translates the $label comparison and its denominator", ({ price, label, amount, percent }) => {
    i18n.language = "en";
    const overview = render({ property: { ...property, price } }).split("<details")[0]!.replace(/\s+/g, " ");
    expect(overview).toContain("Current asking price");
    expect(overview).toContain("Should cost");
    expect(overview).toContain(label);
    expect(overview).toContain(amount);
    expect(overview).toContain(`${percent} of asking price`);
    expect(overview).not.toContain("Should-be price");
  });

  it("translates the should-be price and missing original explanation into English", () => {
    i18n.language = "en";
    const html = render();
    expect(html).toContain("Price by time on market");
    expect(html).toContain("Should cost");
    expect(html).toContain("4,810,000");
    expect(html).toContain("above ‘Should cost’");
    expect(html).toContain("not a market valuation");
    const missing = render({ history: history({ events: [] }) });
    expect(missing).toContain("The original asking price is missing");
    expect(missing).toContain('data-testid="workbook-time-basis"');
    expect(missing).not.toContain('data-testid="workbook-target-price"');
  });

  it("makes estimated first asking prices explicit in both languages", () => {
    const data = history({ events: [{ ...first, price: null }], observations: [askingChange] });
    const da = render({ history: data });
    expect(da).toContain("Burde koste");
    expect(da).toContain("beregnet fra Boligsidens afrundede prisændring");
    expect(da).toContain("omtrentligt scenario");
    expect(da).toContain("4.810.000");
    i18n.language = "en";
    const en = render({ history: data });
    expect(en).toContain("Should cost");
    expect(en).toContain("approximate scenario");
    expect(en).toContain("4,810,000");
  });

  it("shows the original baseline beside the same should-be price after current asking is reduced", () => {
    for (const price of [5_200_000, 4_900_000]) {
      const html = render({ property: { ...property, price }, history: history({ events: [], observations: [askingChange] }) });
      expect(html).toContain('data-testid="workbook-target-price"');
      expect(html).toContain("4.810.000");
      expect(html).toContain('data-testid="workbook-original-price-basis"');
      expect(html).toContain("5.500.000");
      expect(html).toContain("5.200.000");
      expect(html).not.toContain('data-testid="workbook-current-price-basis"');
    }
  });

  it.each([0, NaN])("keeps the original-based target but omits the gap when today's asking is %s", price => {
    const html = render({ property: { ...property, price }, history: history({ events: [], observations: [askingChange] }) });
    expect(html).toContain('data-testid="workbook-target-price"');
    expect(html).toContain("4.810.000");
    expect(html).toContain("Ukendt");
    expect(html).not.toContain('data-testid="workbook-price-gap"');
    expect(html).not.toContain("NaN");
  });

  it("keeps a cached should-be price visible when refreshing history fails, with a retry and freshness warning", () => {
    const data = history();
    data.episodes[0] = { ...data.episodes[0]!, observedAt: "2026-09-16T09:00:00.000Z" };
    const html = render({ history: data, failed: true });
    expect(html).toContain('data-state="available"');
    expect(html).toContain("Udbudshistorikken kunne ikke hentes");
    expect(html).toContain("Prøv igen");
    expect(html).toContain("Kilden er ikke blevet bekræftet i over en uge");
    expect(html).toContain("4.810.000");
    expect(html).toContain('data-testid="workbook-target-price"');
  });

  it("shows historical statistics while waiting for uncached original-price evidence", () => {
    const loading = render({ history: undefined, loading: true });
    expect(loading).toContain('aria-busy="true"');
    expect(loading).not.toContain('data-testid="workbook-target-price"');
    expect(loading).toContain("Den oprindelige udbudspris mangler");
    expect(loading).toContain('data-testid="workbook-time-basis"');
    expect(loading).toContain("Opdaterer udbudshistorik");
  });

  it("retains the documented-price calculation while refreshing cached history", () => {
    const html = render({ loading: true });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-testid="workbook-target-price"');
    expect(html).toContain("4.810.000");
  });

  it("shows missing original evidence and retry when no history could be loaded", () => {
    const html = render({ history: undefined, failed: true });
    expect(html).not.toContain('data-testid="workbook-target-price"');
    expect(html).toContain("Den oprindelige udbudspris mangler");
    expect(html).toContain('data-testid="workbook-time-basis"');
    expect(html).toContain("Udbudshistorikken kunne ikke hentes");
    expect(html).toContain("Prøv igen");
  });

  it("retains known listing time while explaining truncated original-price evidence", () => {
    const truncated = render({ history: history({ truncated: true }) });
    expect(truncated).toContain("Udbudshistorikken er ufuldstændig");
    expect(truncated).not.toContain('data-testid="workbook-target-price"');
    expect(truncated).toContain("Den oprindelige udbudspris mangler");
    expect(truncated).toContain('data-testid="workbook-time-basis"');
    expect(truncated).toContain("188 dage på markedet");
    expect(truncated).not.toContain("Dokumenteret første udbud:");
  });

  it("shows a clearly labelled broad historical scenario outside the original sample scope", () => {
    const html = render({ property: { ...property, postalCode: "8000" } });
    expect(html).toContain("Bredt historisk scenario");
    expect(html).toContain("ikke baseret på lokale, sammenlignelige handler");
    expect(html).toContain('data-testid="workbook-target-price"');
  });

  it("keeps historical data visible without inventing an original or requiring comparable sales", () => {
    const html = render({ history: history({ events: [], transactions: [] }) });
    expect(html).toContain("Den oprindelige udbudspris mangler");
    expect(html).toContain("12,5 %");
    expect(html).toContain("22 historiske handler");
    expect(html).toContain('data-testid="workbook-historical-groups"');
    expect(html).not.toContain('data-testid="workbook-target-price"');
  });

  it("keeps the broad sample scope visible beside a discount when first asking is missing", () => {
    const html = render({ property: { ...property, postalCode: "8000" }, history: history({ events: [] }) });
    expect(html).toContain("Den oprindelige udbudspris mangler");
    expect(html).toContain('data-testid="workbook-time-basis"');
    expect(html).toContain('data-testid="workbook-broad-scenario"');
    expect(html).toContain("ikke baseret på lokale, sammenlignelige handler");
    expect(html.indexOf('data-testid="workbook-broad-scenario"')).toBeLessThan(html.indexOf("<details"));
    expect(html).not.toContain('data-testid="workbook-target-price"');
  });

  it("explains 10,000-kr rounding and retains all historical groups when listing time is missing", () => {
    const data = history();
    data.episodes[0] = { ...data.episodes[0]!, startDate: null, datePrecision: "unknown" };
    const html = render({ property: { ...property, listingDate: null }, history: data });
    expect(html).toContain("Beløb afrundes til 10.000 kr.");
    expect(html).toContain('data-testid="workbook-historical-groups"');
    expect(html).toContain('data-testid="workbook-target-price"');
    expect(html).toContain("5.170.000");
    expect(html).toContain("Liggetid ukendt");
  });

  it("shows all-sales statistics without a monetary target when original and listing time are both missing", () => {
    const input = { property: { ...property, listingDate: null }, history: undefined, failed: true };
    const da = render(input);
    expect(da).not.toContain('data-testid="workbook-target-price"');
    expect(da).toContain("Den oprindelige udbudspris mangler");
    expect(da).toContain("Liggetid ukendt");
    expect(da).toContain("281 historiske handler");
    expect(da).not.toContain("Dokumenteret første udbud:");
    i18n.language = "en";
    const en = render(input);
    expect(en).not.toContain('data-testid="workbook-target-price"');
    expect(en).toContain("The original asking price is missing");
    expect(en).toContain("Time on market unknown");
    expect(en).toContain("Retry");
  });

  it("excludes future original-price evidence but still shows all-sales statistics", () => {
    const html = render({ history: history({ retrievedAt: "2026-09-27T23:00:00.000Z" }) });
    expect(html).not.toContain('data-testid="workbook-target-price"');
    expect(html).toContain("Den oprindelige udbudspris mangler");
    expect(html).toContain("Liggetid ukendt");
    expect(html).toContain('data-testid="workbook-time-basis"');
    expect(html).not.toContain("Dokumenteret første udbud:");
    expect(html).not.toContain("188 dage på markedet");
  });

  it("does not invent a monetary price when neither current nor first asking price is valid", () => {
    const input = { ...property, price: 0, listingDate: null };
    const result = workbookListingReference(input);
    expect(result.reference).toMatchObject({ status: "missing_first_asking", referencePrice: null });
    const html = render({ property: input, history: undefined });
    expect(html).not.toContain('data-testid="workbook-target-price"');
    expect(html).toContain('data-testid="workbook-historical-groups"');
    expect(html).not.toContain("NaN");
  });

  it("shows below-reference prices as below, without suggesting a negative reduction", () => {
    const html = render({ property: { ...property, price: 4_700_000 } });
    expect(html).toContain("110.000");
    expect(html).toContain("under ‘Burde koste’");
    expect(html).not.toContain("-110.000");
  });
});

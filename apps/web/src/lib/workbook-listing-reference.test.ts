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
const render = (overrides: Partial<Parameters<typeof WorkbookPriceReferenceCard>[0]> = {}) => renderToStaticMarkup(createElement(WorkbookPriceReferenceCard, {
  property, history: history(), loading: false, failed: false, onRetry: () => {}, ...overrides,
}));

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)); i18n.language = "da"; });
afterEach(() => vi.useRealTimers());

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
    expect(result.reference).toMatchObject({ status: "available", referencePrice: 4_550_000, priceBasis: "current_asking" });
  });

  it("uses the current-price scenario without resolving conflicting first asking prices", () => {
    const result = workbookListingReference(property, history({ events: [first, { ...first, id: "conflict", price: 6_000_000 }], observations: [askingChange] }));
    expect(result.reference).toMatchObject({ status: "available", referencePrice: 4_550_000, priceBasis: "current_asking" });
    expect(result.firstAsking).toBeNull();
    expect(result.estimatedFirst).toBeNull();
  });

  it("uses the listing's date and current price while history is unavailable", () => {
    const result = workbookListingReference(property);
    expect(result.reference).toMatchObject({ status: "available", referencePrice: 4_550_000, gapAmount: 650_000, priceBasis: "current_asking" });
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

  it("rejects a percentage attached to another episode or a different current asking price", () => {
    for (const observation of [{ ...askingChange, episodeId: "old-episode" }, { ...askingChange, value: { currentAsking: 5_000_000, changePercent: -5.45 } }]) {
      const result = workbookListingReference(property, history({ events: [], observations: [observation] }));
      expect(result.reference).toMatchObject({ status: "available", referencePrice: 4_550_000, priceBasis: "current_asking" });
      expect(result.firstAsking).toBeNull();
      expect(result.estimatedFirst).toBeNull();
    }
  });

  it("does not substitute firstSeenAt when both the listing date and episode start are unknown", () => {
    const data = history();
    data.episodes[0] = { ...data.episodes[0]!, startDate: null, datePrecision: "unknown" };
    const result = workbookListingReference({ ...property, listingDate: null }, data);
    expect(result.reference).toMatchObject({ status: "available", timeBasis: "all_sales", priceBasis: "first_asking", referencePrice: 5_170_000, bracket: { count: 281 } });
    expect(result.listing.time.latestEpisodeDays).toBeNull();
  });

  it("uses all historical sales and today's price when both first asking and listing time are unknown", () => {
    const result = workbookListingReference({ ...property, listingDate: null });
    expect(result.reference).toMatchObject({ status: "available", priceBasis: "current_asking", timeBasis: "all_sales", referencePrice: 4_890_000, bracket: { count: 281 } });
    expect(result.firstAsking).toBeNull();
    expect(result.listing.time.latestEpisodeDays).toBeNull();
    expect(result.listing.time.firstDocumentedListing).toBeNull();
  });

  it("retains the known latest listing time but uses today's price with truncated history", () => {
    const result = workbookListingReference(property, history({ truncated: true }));
    expect(result.reference).toMatchObject({ status: "available", referencePrice: 4_550_000, priceBasis: "current_asking" });
    expect(result.listing.time.latestEpisodeDays).toBe(188);
    expect(result.firstAsking).toBeNull();
  });

  it.each(["demo", "mock", "unknown"] as const)("offers a scenario for %s data without claiming documented listing evidence", dataMode => {
    const result = workbookListingReference({ ...property, dataMode }, history());
    expect(result.reference).toMatchObject({ status: "available", priceBasis: "current_asking", timeBasis: "all_sales", referencePrice: 4_890_000 });
    expect(result.firstAsking).toBeNull();
    expect(result.listing.time.latestEpisodeDays).toBeNull();
    expect(result.lastSourceCheck).toBeNull();
  });

  it.each(["sold", "withdrawn"] as const)("offers a scenario for %s listings without implying they are currently on the market", status => {
    const result = workbookListingReference({ ...property, status }, history());
    expect(result.reference).toMatchObject({ status: "available", priceBasis: "current_asking", timeBasis: "all_sales", referencePrice: 4_890_000 });
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

  it.each(["episode", "first_price", "retrieval", "campaign"])("excludes a same-day future %s observation while retaining the pooled scenario", target => {
    const future = "2026-09-27T23:00:00.000Z";
    const data = history();
    if (target === "episode") data.episodes[0] = { ...data.episodes[0]!, observedAt: future };
    if (target === "first_price") data.events[0] = { ...first, observedAt: future };
    if (target === "retrieval") data.retrievedAt = future;
    if (target === "campaign") data.campaigns[0] = { ...data.campaigns[0]!, observedAt: future };
    const result = workbookListingReference(property, data);
    expect(result.invalidSourceTiming).toBe(true);
    expect(result.reference).toMatchObject({ status: "available", priceBasis: "current_asking", timeBasis: "all_sales", referencePrice: 4_890_000 });
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
    expect(html).toContain("Bør-pris");
    expect(html).toContain("4.810.000");
    expect(html).toContain("5.200.000");
    expect(html).toContain("390.000");
    expect(html).toContain("over prisreferencen");
    expect(html).toContain("281 historiske villasalg");
    expect(html).toContain("2026-09-27");
    expect(html).toContain("ikke en markedsvurdering");
    expect(html.indexOf('data-testid="workbook-target-price"')).toBeLessThan(html.indexOf("<details"));
  });

  it("translates the should-be price and current asking fallback into English", () => {
    i18n.language = "en";
    const html = render();
    expect(html).toContain("Price by time on market");
    expect(html).toContain("Should-be price");
    expect(html).toContain("4,810,000");
    expect(html).toContain("above the price reference");
    expect(html).toContain("not a market valuation");
    const fallback = render({ history: history({ events: [] }) });
    expect(fallback).toContain("Calculated from the current asking price");
    expect(fallback).toContain("4,550,000");
    expect(fallback).toContain('data-testid="workbook-target-price"');
  });

  it("makes estimated first asking prices explicit in both languages", () => {
    const data = history({ events: [{ ...first, price: null }], observations: [askingChange] });
    const da = render({ history: data });
    expect(da).toContain("Bør-pris");
    expect(da).toContain("beregnet fra Boligsidens afrundede prisændring");
    expect(da).toContain("omtrentligt scenario");
    expect(da).toContain("4.810.000");
    i18n.language = "en";
    const en = render({ history: data });
    expect(en).toContain("Should-be price");
    expect(en).toContain("approximate scenario");
    expect(en).toContain("4,810,000");
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

  it("uses today's price and the listing date while history loads", () => {
    const loading = render({ history: undefined, loading: true });
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('data-testid="workbook-target-price"');
    expect(loading).toContain("4.550.000");
    expect(loading).toContain("Beregnet fra dagens udbudspris");
    expect(loading).toContain("Opdaterer udbudshistorik");
  });

  it("retains the documented-price calculation while refreshing cached history", () => {
    const html = render({ loading: true });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-testid="workbook-target-price"');
    expect(html).toContain("4.810.000");
  });

  it("shows a current-price fallback and retry when no history could be loaded", () => {
    const html = render({ history: undefined, failed: true });
    expect(html).toContain('data-testid="workbook-target-price"');
    expect(html).toContain("4.550.000");
    expect(html).toContain("Beregnet fra dagens udbudspris");
    expect(html).toContain("Udbudshistorikken kunne ikke hentes");
    expect(html).toContain("Prøv igen");
  });

  it("uses known listing time and today's price while explaining truncated history", () => {
    const truncated = render({ history: history({ truncated: true }) });
    expect(truncated).toContain("Udbudshistorikken er ufuldstændig");
    expect(truncated).toContain('data-testid="workbook-target-price"');
    expect(truncated).toContain("4.550.000");
    expect(truncated).toContain("Beregnet fra dagens udbudspris");
    expect(truncated).toContain("188 dage på markedet");
    expect(truncated).not.toContain("Dokumenteret første udbud:");
  });

  it("shows a clearly labelled broad historical scenario outside the original sample scope", () => {
    const html = render({ property: { ...property, postalCode: "8000" } });
    expect(html).toContain("Bredt historisk scenario");
    expect(html).toContain("ikke baseret på lokale, sammenlignelige handler");
    expect(html).toContain('data-testid="workbook-target-price"');
  });

  it("shows the should-be price without a first asking price or any comparable sales", () => {
    const html = render({ history: history({ events: [], transactions: [] }) });
    expect(html).toContain("Beregnet fra dagens udbudspris");
    expect(html).toContain("4.550.000");
    expect(html).toContain("12,5 %");
    expect(html).toContain("22 historiske handler");
    expect(html).toContain('data-testid="workbook-historical-groups"');
    expect(html).toContain('data-testid="workbook-target-price"');
  });

  it("keeps the broad sample scope visible beside a discount when first asking is missing", () => {
    const html = render({ property: { ...property, postalCode: "8000" }, history: history({ events: [] }) });
    expect(html).toContain("4.550.000");
    expect(html).toContain("Beregnet fra dagens udbudspris");
    expect(html).toContain('data-testid="workbook-broad-scenario"');
    expect(html).toContain("ikke baseret på lokale, sammenlignelige handler");
    expect(html.indexOf('data-testid="workbook-broad-scenario"')).toBeLessThan(html.indexOf("<details"));
    expect(html).toContain('data-testid="workbook-target-price"');
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

  it("shows the all-sales scenario when first asking price and listing time are both missing", () => {
    const input = { property: { ...property, listingDate: null }, history: undefined, failed: true };
    const da = render(input);
    expect(da).toContain('data-testid="workbook-target-price"');
    expect(da).toContain("4.890.000");
    expect(da).toContain("Beregnet fra dagens udbudspris");
    expect(da).toContain("Liggetid ukendt");
    expect(da).toContain("281 historiske handler");
    expect(da).not.toContain("Dokumenteret første udbud:");
    i18n.language = "en";
    const en = render(input);
    expect(en).toContain("4,890,000");
    expect(en).toContain("Calculated from the current asking price");
    expect(en).toContain("Time on market unknown");
    expect(en).toContain("Retry");
  });

  it("excludes future evidence but still shows a labelled current-price and all-sales scenario", () => {
    const html = render({ history: history({ retrievedAt: "2026-09-27T23:00:00.000Z" }) });
    expect(html).toContain('data-testid="workbook-target-price"');
    expect(html).toContain("4.890.000");
    expect(html).toContain("Liggetid ukendt");
    expect(html).toContain("Beregnet fra dagens udbudspris");
    expect(html).not.toContain("Dokumenteret første udbud:");
    expect(html).not.toContain("188 dage på markedet");
  });

  it("does not invent a monetary price when neither current nor first asking price is valid", () => {
    const input = { ...property, price: 0, listingDate: null };
    const result = workbookListingReference(input);
    expect(result.reference).toMatchObject({ status: "missing_price", referencePrice: null });
    const html = render({ property: input, history: undefined });
    expect(html).not.toContain('data-testid="workbook-target-price"');
    expect(html).toContain('data-testid="workbook-historical-groups"');
    expect(html).not.toContain("NaN");
  });

  it("shows below-reference prices as below, without suggesting a negative reduction", () => {
    const html = render({ property: { ...property, price: 4_700_000 } });
    expect(html).toContain("110.000");
    expect(html).toContain("under prisreferencen");
    expect(html).not.toContain("-110.000");
  });
});

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
    expect(result.reference).toMatchObject({ status: "available", referencePrice: 4_800_000, lowerPrice: 4_650_000, upperPrice: 5_100_000, gapAmount: 400_000 });
    expect(result.listing.time.latestEpisodeDays).toBe(188);
    expect(result.firstAsking).toBe(5_500_000);
    expect(result.estimatedFirst).toBeNull();
    expect(result.lastSourceCheck).toBe(NOW);
    expect(result.stale).toBe(false);
  });

  it("does not derive the first asking price from the crawler's first observation", () => {
    const result = workbookListingReference(property, history({ events: [{ ...first, eventType: "observation", price: property.price, eventDate: null, datePrecision: "unknown" }] }));
    expect(result.reference.status).toBe("missing_first_asking");
    expect(result.reference.referencePrice).toBeNull();
  });

  it("withholds the price for conflicting documented first asking prices", () => {
    const result = workbookListingReference(property, history({ events: [first, { ...first, id: "conflict", price: 6_000_000 }], observations: [askingChange] }));
    expect(result.reference.referencePrice).toBeNull();
    expect(result.estimatedFirst).toBeNull();
  });

  it("uses a labelled source-derived scenario when the first-listing event has no price", () => {
    const result = workbookListingReference(property, history({ events: [{ ...first, price: null }], observations: [askingChange] }));
    expect(result.reference).toMatchObject({ status: "available", referencePrice: 4_800_000, gapAmount: 400_000 });
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
    expect(result.reference.referencePrice).toBe(4_800_000);
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
      expect(workbookListingReference(property, history({ events: [], observations: [observation] })).reference.referencePrice).toBeNull();
    }
  });

  it("does not substitute firstSeenAt when both the listing date and episode start are unknown", () => {
    const data = history();
    data.episodes[0] = { ...data.episodes[0]!, startDate: null, datePrecision: "unknown" };
    const result = workbookListingReference({ ...property, listingDate: null }, data);
    expect(result.reference.status).toBe("missing_days");
    expect(result.reference.referencePrice).toBeNull();
  });

  it.each(["demo", "mock", "unknown"] as const)("does not value a %s listing", dataMode => {
    expect(workbookListingReference({ ...property, dataMode }, history()).reference.referencePrice).toBeNull();
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

  it.each(["episode", "first_price", "retrieval", "campaign"])("withholds prices from a same-day future %s observation", target => {
    const future = "2026-09-27T23:00:00.000Z";
    const data = history();
    if (target === "episode") data.episodes[0] = { ...data.episodes[0]!, observedAt: future };
    if (target === "first_price") data.events[0] = { ...first, observedAt: future };
    if (target === "retrieval") data.retrievedAt = future;
    if (target === "campaign") data.campaigns[0] = { ...data.campaigns[0]!, observedAt: future };
    const result = workbookListingReference(property, data);
    expect(result.invalidSourceTiming).toBe(true);
    expect(result.reference.referencePrice).toBeNull();
    expect(result.estimatedFirst).toBeNull();
    expect(result.lastSourceCheck).toBeNull();
  });
});

describe("prominent price by time on market card", () => {
  it("shows the target, current asking price, gap, sample and source dates without opening a tab", () => {
    const html = render();
    expect(html).toContain('data-state="available"');
    expect(html).toContain("Pris efter liggetid");
    expect(html).toContain("4.800.000");
    expect(html).toContain("5.200.000");
    expect(html).toContain("400.000");
    expect(html).toContain("over prisreferencen");
    expect(html).toContain("281 historiske villasalg");
    expect(html).toContain("2026-09-27");
    expect(html).toContain("ikke en markedsvurdering");
    expect(html.indexOf('data-testid="workbook-target-price"')).toBeLessThan(html.indexOf("<details"));
  });

  it("translates the reference and missing-data explanation into English", () => {
    i18n.language = "en";
    const html = render();
    expect(html).toContain("Price by time on market");
    expect(html).toContain("4,800,000");
    expect(html).toContain("above the price reference");
    expect(html).toContain("not a market valuation");
    const missing = render({ history: history({ events: [] }) });
    expect(missing).toContain("The first asking price is missing");
    expect(missing).not.toContain('data-testid="workbook-target-price"');
  });

  it("makes estimated first asking prices explicit in both languages", () => {
    const data = history({ events: [{ ...first, price: null }], observations: [askingChange] });
    const da = render({ history: data });
    expect(da).toContain("Omtrentlig prisreference");
    expect(da).toContain("beregnet fra Boligsidens afrundede prisændring");
    expect(da).toContain("omtrentligt scenario");
    expect(da).toContain("4.800.000");
    i18n.language = "en";
    const en = render({ history: data });
    expect(en).toContain("Approximate price reference");
    expect(en).toContain("approximate scenario");
    expect(en).toContain("4,800,000");
  });

  it("does not present stale cached evidence as a successful calculation after a request fails", () => {
    const html = render({ failed: true });
    expect(html).toContain('data-state="error"');
    expect(html).toContain("Udbudshistorikken kunne ikke hentes");
    expect(html).toContain("Prøv igen");
    expect(html).not.toContain('data-testid="workbook-target-price"');
  });

  it("explains loading and truncated history without a made-up amount", () => {
    const loading = render({ loading: true });
    expect(loading).toContain('aria-busy="true"');
    expect(loading).not.toContain('data-testid="workbook-target-price"');
    const truncated = render({ history: history({ truncated: true }) });
    expect(truncated).toContain("Udbudshistorikken er ufuldstændig");
    expect(truncated).not.toContain('data-testid="workbook-target-price"');
  });

  it("shows the scope limitation instead of extrapolating the Aalborg villa sample", () => {
    const html = render({ property: { ...property, postalCode: "8000" } });
    expect(html).toContain("andre boligtyper eller postnumre");
    expect(html).not.toContain('data-testid="workbook-target-price"');
  });

  it("shows below-reference prices as below, without suggesting a negative reduction", () => {
    const html = render({ property: { ...property, price: 4_700_000 } });
    expect(html).toContain("100.000");
    expect(html).toContain("under prisreferencen");
    expect(html).not.toContain("-100.000");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Property } from "@shared/types/index";
import type { ResearchHistoryResponse, ResearchObservation } from "@shared/types/research-api";
import { reportedAskingPrice } from "./reported-asking-price";

const NOW = "2026-09-27T12:00:00Z";
const property = { id: "property-1", externalId: "case-1", listingSource: "boligsiden", status: "active", dataMode: "real", price: 16_500_000 } as Property;
const observation = (overrides: Partial<ResearchObservation> = {}): ResearchObservation => ({
  id: "observation-1", propertyId: property.id, episodeId: "episode-1", source: "boligsiden", sourceUrl: null,
  fieldName: "asking_price_change", value: { currentAsking: property.price, changePercent: 3.13 },
  effectiveDate: "2026-09-27", observedAt: NOW, datePrecision: "day", method: "source_reported_price_change",
  verificationStatus: "unverified", dataMode: "real", sourceFile: null, sourceSheet: null, sourceRow: null,
  sourceVersion: "crawl-v2", conflictGroup: null, ...overrides,
});
const history = (): ResearchHistoryResponse => ({
  campaigns: [], episodes: [{ id: "episode-1", propertyId: property.id, campaignId: "campaign-1", source: "boligsiden",
    sourceListingId: "case-1", sourceUrl: null, startDate: null, endDate: null, datePrecision: "unknown", status: "active",
    agentName: null, observedAt: NOW, dataMode: "real" }], events: [], observations: [observation()],
  transactions: [], conditionEvidence: [], dataVersion: "fixture", retrievedAt: NOW, truncated: false,
});
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)); });
afterEach(() => vi.useRealTimers());

describe("reported asking-price scenario baseline", () => {
  it("reconstructs both price increases and decreases without rounding into a documented fact", () => {
    expect(reportedAskingPrice(property, history())?.firstAsking).toBeCloseTo(16_500_000 / 1.0313);
    const h = history(); h.observations = [observation({ value: { currentAsking: property.price, changePercent: -10 } })];
    expect(reportedAskingPrice(property, h)?.firstAsking).toBeCloseTo(16_500_000 / .9);
    h.observations = [observation({ value: { currentAsking: property.price, changePercent: 0 } })];
    expect(reportedAskingPrice(property, h)?.firstAsking).toBe(property.price);
    expect(h.events).toEqual([]);
  });
  it("rejects incomplete history, inactive/demo listings, or ambiguous current episodes", () => {
    expect(reportedAskingPrice(property)).toBeNull();
    expect(reportedAskingPrice(property, { ...history(), truncated: true })).toBeNull();
    for (const overrides of [{ status: "sold" }, { dataMode: "mock" }, { listingSource: "boliga" }]) {
      expect(reportedAskingPrice({ ...property, ...overrides } as Property, history())).toBeNull();
    }
    const h = history(); h.episodes.push({ ...h.episodes[0]!, id: "another" });
    expect(reportedAskingPrice(property, h)).toBeNull();
  });
  it("only uses dated, same-episode, nonconflicting real observations", () => {
    for (const overrides of [{ dataMode: "mock" }, { episodeId: "old" }, { conflictGroup: "conflict" },
      { observedAt: "2026-09-28T12:00:00Z" }, { observedAt: "2026-02-30T12:00:00Z" }, { effectiveDate: "2026-09-26" },
      { value: { currentAsking: property.price, changePercent: -100 } }, { value: { currentAsking: property.price, changePercent: "3.13" } }]) {
      const h = history(); h.observations = [observation(overrides as Partial<ResearchObservation>)];
      expect(reportedAskingPrice(property, h)).toBeNull();
    }
    const h = history(); h.observations.push(observation({ id: "conflicting", value: { currentAsking: property.price, changePercent: 4 } }));
    expect(reportedAskingPrice(property, h)).toBeNull();
  });
  it("uses the newest complete source pair independently of today's asking price", () => {
    const h = history(); h.observations = [observation({ observedAt: "2026-09-26T12:00:00Z", effectiveDate: "2026-09-26" }),
      observation({ value: { currentAsking: 16_000_000, changePercent: 0 } })];
    expect(reportedAskingPrice(property, h)).toMatchObject({ firstAsking: 16_000_000, askingAtObservation: 16_000_000, changePercent: 0 });
  });
  it("keeps the recovered original unchanged when today's asking price falls or is unavailable", () => {
    const h = history();
    h.observations = [observation({ value: { currentAsking: 5_200_000, changePercent: -5.45 } })];
    for (const price of [5_200_000, 4_900_000, 0]) {
      const result = reportedAskingPrice({ ...property, price }, h);
      expect(result?.firstAsking).toBeCloseTo(5_200_000 / .9455);
      expect(result).toMatchObject({ askingAtObservation: 5_200_000, changePercent: -5.45, observedAt: NOW });
    }
  });
  it("rejects a price pair observed before the current episode began", () => {
    const h = history();
    h.episodes[0] = { ...h.episodes[0]!, startDate: "2026-09-27", datePrecision: "day" };
    h.observations = [observation({ observedAt: "2026-09-26T12:00:00Z", effectiveDate: "2026-09-26" })];
    expect(reportedAskingPrice(property, h)).toBeNull();
  });
  it.each([
    { conflictGroup: "latest-conflict" },
    { verificationStatus: "conflict" },
    { value: { currentAsking: property.price, changePercent: "unknown" } },
    { method: "unknown_method" },
    { datePrecision: "unknown" },
  ])("does not resurrect older evidence when the newest observation is invalid: %j", (overrides) => {
    const h = history();
    h.observations = [observation({ observedAt: "2026-09-26T12:00:00Z", effectiveDate: "2026-09-26" }),
      observation({ id: "newest", ...overrides } as Partial<ResearchObservation>)];
    expect(reportedAskingPrice(property, h)).toBeNull();
  });
  it("blocks conflicts at the newest timestamp even alongside a valid value", () => {
    const h = history();
    h.observations = [observation(), observation({ id: "latest-conflict", verificationStatus: "conflict" })];
    expect(reportedAskingPrice(property, h)).toBeNull();
  });
  it("allows a newer valid observation to supersede an older conflicted value", () => {
    const h = history();
    h.observations = [observation({ observedAt: "2026-09-26T12:00:00Z", effectiveDate: "2026-09-26", conflictGroup: "old-conflict" }),
      observation({ id: "resolved", verificationStatus: "verified" })];
    expect(reportedAskingPrice(property, h)?.firstAsking).toBeCloseTo(16_500_000 / 1.0313);
  });
  it("rejects a same-day future observation instead of reverting to an earlier estimate", () => {
    const h = history();
    h.observations = [observation(), observation({ id: "future", observedAt: "2026-09-27T23:00:00Z" })];
    expect(reportedAskingPrice(property, h)).toBeNull();
  });
  it("never bypasses an existing first-price conflict or a relisted campaign", () => {
    for (const eventType of ["first_listing", "relisted", "sold"] as const) {
      const h = history(); h.events = [{ id: "event-1", propertyId: property.id, campaignId: "campaign-1", episodeId: "episode-1",
        eventType, eventDate: "2026-09-01", eventDateEnd: null, datePrecision: "day", price: 16_000_000,
        source: "boligsiden", sourceUrl: null, observedAt: NOW, dataMode: "real" }];
      expect(reportedAskingPrice(property, h)).toBeNull();
    }
  });
});

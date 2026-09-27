import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Property } from "@shared/types/index";
import type { ResearchCampaign, ResearchEpisode, ResearchEvent, ResearchHistoryResponse, ResearchObservation } from "@shared/types/research-api";
import { researchListingTime } from "./research-listing-time";
import { listingEvidence } from "./listing-evidence";

const NOW = "2026-09-26T12:00:00.000Z";
const ago = (days: number) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString().slice(0, 10);
const property = { id: "property-1", dataMode: "real", status: "active", listingSource: "boligsiden", externalId: "case-1", listingDate: ago(91), firstSeenAt: `${ago(21)}T12:00:00.000Z`, updatedAt: NOW } as Property;
const campaign = (id = "campaign-1"): ResearchCampaign => ({ id, propertyId: property.id, source: property.listingSource, sourceUrl: null, linkReason: "Samme kilde og annonce-id", observedAt: NOW });
const episode = (overrides: Partial<ResearchEpisode> = {}): ResearchEpisode => ({ id: "episode-current", propertyId: property.id, campaignId: "campaign-1", source: property.listingSource, sourceListingId: property.externalId, sourceUrl: null, startDate: ago(91), endDate: null, datePrecision: "day", status: "active", agentName: "Mægler", observedAt: NOW, dataMode: "real", ...overrides });
const event = (overrides: Partial<ResearchEvent> = {}): ResearchEvent => ({ id: "event-first", propertyId: property.id, campaignId: "campaign-1", episodeId: "episode-current", eventType: "first_listing", eventDate: ago(91), eventDateEnd: null, datePrecision: "day", price: 4_600_000, source: property.listingSource, sourceUrl: null, observedAt: NOW, dataMode: "real", ...overrides });
const history = (overrides: Partial<ResearchHistoryResponse> = {}): ResearchHistoryResponse => ({ campaigns: [campaign()], episodes: [episode()], events: [event()], transactions: [], observations: [], conditionEvidence: [], dataVersion: "fixture/1", retrievedAt: NOW, truncated: false, ...overrides });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)); });
afterEach(() => vi.useRealTimers());

describe("current listing chronology adapter", () => {
  it("keeps latest, active union, calendar time and technical first observation separate", () => {
    const prior = episode({ id: "prior", startDate: ago(500), endDate: ago(144), status: "removed" });
    const concurrent = episode({ id: "concurrent", source: "boliga", sourceListingId: "other-source", startDate: ago(75) });
    const result = researchListingTime(property, history({ episodes: [prior, episode(), concurrent], events: [event({ eventDate: ago(500), episodeId: prior.id })] }));
    expect(result.campaignId).toBe("campaign-1");
    expect(result.time.latestEpisodeDays).toBe(91);
    expect(result.time.activeDays).toBe(447);
    expect(result.time.calendarDays).toBe(500);
    expect(result.time.firstSeenAt).toBe(property.firstSeenAt);
    expect(result.time.latestEpisodeDefinition).toContain("boligsiden");
    expect(result.time.latestEpisodeDefinition).toContain("ikke samlet aktiv tid");
    expect(result.firstAsking).toBe(4_600_000);
  });
  it("uses source-reported listingDate for latest elapsed days only when episode history is unavailable", () => {
    const result = researchListingTime(property);
    expect(result.time.latestEpisodeDays).toBe(91);
    expect(result.time.latestEpisodeDefinition).toContain("kildens dokumenterede annoncedato");
    expect(result.time.activeDays).toBeNull(); expect(result.time.calendarDays).toBeNull();
    expect(result.time.firstDocumentedListing).toBeNull(); expect(result.firstAsking).toBeNull(); expect(result.campaignId).toBeNull();
  });
  it("never substitutes firstSeenAt, creation or update dates for missing listing dates", () => {
    const result = researchListingTime({ ...property, listingDate: null });
    expect(result.time.latestEpisodeDays).toBeNull(); expect(result.time.calendarDays).toBeNull();
    expect(result.time.firstSeenAt).toBe(property.firstSeenAt);
  });
  it("can know latest and active time without claiming a first campaign date", () => {
    const result = researchListingTime(property, history({ events: [] }));
    expect(result.time.latestEpisodeDays).toBe(91); expect(result.time.activeDays).toBe(91);
    expect(result.time.calendarDays).toBeNull(); expect(result.firstAsking).toBeNull();
  });
  it("withholds first/total metrics in truncated histories and never falls back without episodes", () => {
    const result = researchListingTime(property, history({ truncated: true }));
    expect(result.time.latestEpisodeDays).toBe(91); expect(result.time.activeDays).toBeNull();
    expect(result.time.calendarDays).toBeNull(); expect(result.firstAsking).toBeNull();
    expect(researchListingTime(property, history({ truncated: true, episodes: [] })).time.latestEpisodeDays).toBeNull();
  });
  it("does not reuse a stale source listing date after a known relist", () => {
    const relist = event({ id: "relist", eventType: "relisted", datePrecision: "interval", eventDate: ago(7), eventDateEnd: ago(3), price: null });
    const unknown = researchListingTime(property, history({ episodes: [episode({ startDate: null, datePrecision: "unknown" })], events: [relist] }));
    expect(unknown.time.latestEpisodeDays).toBeNull(); expect(unknown.time.activeDays).toBeNull();
    expect(researchListingTime(property, history({ episodes: [], events: [relist] })).time.latestEpisodeDays).toBeNull();
    expect(researchListingTime(property, history({ events: [relist] })).time.latestEpisodeDays).toBeNull();
  });
  it("refuses concurrent different campaigns and ambiguous current source episodes", () => {
    const second = episode({ id: "second", campaignId: "campaign-2", source: "boliga", sourceListingId: "case-2" });
    const result = researchListingTime(property, history({ campaigns: [campaign(), campaign("campaign-2")], episodes: [episode(), second] }));
    expect(result.campaignId).toBeNull(); expect(result.time.latestEpisodeDays).toBeNull(); expect(result.firstAsking).toBeNull();
    expect(researchListingTime(property, history({ episodes: [episode(), episode({ id: "duplicate" })] })).time.latestEpisodeDays).toBeNull();
  });
  it("does not choose unrelated source identities or missing/foreign campaigns by recency", () => {
    expect(researchListingTime(property, history({ episodes: [episode({ sourceListingId: "former-case" })] })).campaignId).toBeNull();
    expect(researchListingTime(property, history({ campaigns: [] })).campaignId).toBeNull();
    expect(researchListingTime(property, history({ campaigns: [{ ...campaign(), propertyId: "other" }] })).campaignId).toBeNull();
    expect(researchListingTime(property, history({ campaigns: [{ ...campaign(), source: "Imported workbook" }] })).campaignId).toBeNull();
  });
  it("does not drop unknown or non-live intervals from an apparently complete active sum", () => {
    for (const invalid of [episode({ id: "older", startDate: null, endDate: ago(120), status: "removed" }), episode({ id: "older", startDate: ago(180), endDate: null, status: "paused" }), episode({ id: "older", startDate: ago(180), endDate: ago(120), status: "removed", dataMode: "unknown" })]) {
      const result = researchListingTime(property, history({ episodes: [invalid, episode()] }));
      expect(result.time.latestEpisodeDays).toBe(91); expect(result.time.activeDays).toBeNull();
    }
  });
  it("excludes pauses between precisely documented active intervals", () => {
    const result = researchListingTime(property, history({ episodes: [episode({ id: "prior", startDate: ago(120), endDate: ago(100), status: "paused" }), episode()], events: [] }));
    expect(result.time.latestEpisodeDays).toBe(91); expect(result.time.activeDays).toBe(111);
  });
  it("preserves month precision without inventing day counts or first prices", () => {
    const result = researchListingTime(property, history({ episodes: [episode({ startDate: "2026-06-01", datePrecision: "month" })], events: [event({ eventDate: "2026-06-01", datePrecision: "month" })] }));
    expect(result.time.firstDocumentedListing).toEqual({ value: "2026-06", precision: "month" });
    expect(result.time.latestEpisodeDays).toBeNull(); expect(result.time.activeDays).toBeNull(); expect(result.time.calendarDays).toBeNull(); expect(result.firstAsking).toBeNull();
  });
  it("withholds future or invalid dates instead of rolling them forward or using zero", () => {
    for (const date of ["2026-12-01", "2026-02-30"]) {
      const result = researchListingTime({ ...property, listingDate: date }, history({ episodes: [episode({ startDate: date })], events: [event({ eventDate: date })] }));
      expect(result.time.latestEpisodeDays).toBeNull(); expect(result.time.activeDays).toBeNull(); expect(result.time.calendarDays).toBeNull(); expect(result.firstAsking).toBeNull();
    }
    expect(researchListingTime(property, history({ retrievedAt: "2027-01-01T00:00:00Z" })).time.latestEpisodeDays).toBeNull();
    expect(researchListingTime(property, history({ episodes: [episode({ observedAt: `${ago(100)}T00:00:00Z` })] })).time.latestEpisodeDays).toBeNull();
  });
  it.each(["mock", "demo", "unknown", undefined] as const)("produces no current estimate from %s property data", (dataMode) => {
    const result = researchListingTime({ ...property, dataMode }, history());
    expect(result.time.latestEpisodeDays).toBeNull(); expect(result.time.activeDays).toBeNull(); expect(result.time.calendarDays).toBeNull(); expect(result.firstAsking).toBeNull();
  });
  it.each(["sold", "withdrawn"] as const)("does not treat a %s property as an ongoing listing", (status) => {
    const result = researchListingTime({ ...property, status }, history());
    expect(result.time.latestEpisodeDays).toBeNull(); expect(result.time.activeDays).toBeNull(); expect(result.firstAsking).toBeNull();
  });
  it("never borrows a first price from a former campaign or later first-listing observation", () => {
    const result = researchListingTime(property, history({ events: [event({ campaignId: "former-campaign", id: "former", eventDate: ago(300), price: 2_000_000 }), event({ price: null }), event({ id: "later", eventDate: ago(45), price: 5_000_000 })] }));
    expect(result.firstAsking).toBeNull(); expect(result.time.calendarDays).toBe(91);
  });
  it("preserves the documented date but withholds conflicting first prices", () => {
    const result = researchListingTime(property, history({ events: [event(), event({ id: "conflict", price: 5_000_000 })] }));
    expect(result.firstAsking).toBeNull(); expect(result.time.calendarDays).toBe(91);
    expect(result.warnings.some((warning) => warning.includes("modstridende"))).toBe(true);
  });
  it("withholds metrics when explicit current source starts contradict each other", () => {
    const result = researchListingTime(property, history({ episodes: [episode({ startDate: ago(60) })] }));
    expect(result.time.latestEpisodeDays).toBeNull(); expect(result.time.activeDays).toBeNull(); expect(result.firstAsking).toBeNull();
  });
  it("withholds prior-sale campaign anchors when the same listing id is reused after a sale", () => {
    const prior = episode({ id: "prior-sale", status: "sold", startDate: ago(500), endDate: ago(200) });
    const result = researchListingTime(property, history({ episodes: [prior, episode()], events: [event({ eventDate: ago(500), episodeId: prior.id, price: 2_000_000 })] }));
    expect(result.time.latestEpisodeDays).toBe(91); expect(result.time.activeDays).toBeNull();
    expect(result.time.calendarDays).toBeNull(); expect(result.firstAsking).toBeNull();
  });
  it("does not let a valid old first-price event rescue an impossible current episode", () => {
    for (const invalid of [episode({ endDate: ago(2) }), episode({ startDate: "2026-12-01" }), episode({ observedAt: "2027-01-01T00:00:00Z" })]) {
      const result = researchListingTime({ ...property, listingDate: invalid.startDate }, history({ episodes: [invalid] }));
      expect(result.time.latestEpisodeDays).toBeNull(); expect(result.time.activeDays).toBeNull();
      expect(result.time.calendarDays).toBeNull(); expect(result.firstAsking).toBeNull();
    }
  });
  it("sorts a copy of real property events, retaining older campaigns only in the timeline", () => {
    const payload = history({ events: [event({ id: "late", eventDate: ago(5) }), event({ id: "mock", dataMode: "mock", eventDate: ago(200) }), event({ id: "other-property", propertyId: "other" }), event({ id: "early", eventDate: ago(200), campaignId: "old" })] });
    const before = JSON.stringify(payload);
    expect(researchListingTime(property, payload).events.map((entry) => entry.id)).toEqual(["early", "late"]);
    expect(JSON.stringify(payload)).toBe(before);
  });
});

describe("dated source count as latest-listing duration", () => {
  const noStartProperty = { ...property, listingDate: null };
  const current = episode({ startDate: null, datePrecision: "unknown" });
  const observed: ResearchObservation = {
    id: "duration", propertyId: property.id, episodeId: current.id, fieldName: "reported_time_on_market",
    value: { latestEpisodeDays: 464, totalDays: 600 }, source: property.listingSource, sourceUrl: null,
    effectiveDate: NOW.slice(0, 10), datePrecision: "day", observedAt: NOW, method: "source_reported_duration",
    verificationStatus: "unverified", dataMode: "real", sourceFile: null, sourceSheet: null, sourceRow: null,
    sourceVersion: "source-fixture/1", conflictGroup: null,
  };
  const sourceHistory = (overrides: Partial<ResearchHistoryResponse> = {}) => history({ episodes: [current], events: [], observations: [observed], ...overrides });

  it("uses 464 source days with provenance while leaving other time definitions and starts unknown", () => {
    const data = sourceHistory(); const before = structuredClone(data);
    const result = researchListingTime(noStartProperty, data);
    expect(result.time.latestEpisodeDays).toBe(464);
    expect(result.latestEpisodeSource).toEqual({ kind: "source_reported", source: "boligsiden", observedAt: NOW });
    expect(result.time.latestEpisodeDefinition).toContain("boligsiden");
    expect(result.time.latestEpisodeDefinition).toContain("2026-09-26");
    expect(result.time.activeDays).toBeNull(); expect(result.time.calendarDays).toBeNull();
    expect(result.time.firstDocumentedListing).toBeNull(); expect(result.firstAsking).toBeNull();
    expect(data).toEqual(before); expect(noStartProperty.listingDate).toBeNull();
    expect(data.episodes[0]!.startDate).toBeNull(); expect(data.transactions).toEqual([]);
    expect(listingEvidence(noStartProperty, result, undefined, NOW.slice(0, 10), data)).toMatchObject({ days: 464, documentedDays: false, reportedTime: { days: 464, observedAt: NOW } });
    expect(result.warnings.some(warning => warning.includes("Starten på den aktuelle"))).toBe(false);
  });
  it("does not advance an older observed count or replace precise chronology with it", () => {
    const older = { ...observed, observedAt: `${ago(2)}T12:00:00.000Z`, effectiveDate: ago(2) };
    expect(researchListingTime(noStartProperty, sourceHistory({ observations: [older] })).time.latestEpisodeDays).toBe(464);
    const precise = researchListingTime(property, history({ observations: [observed] }));
    expect(precise.time.latestEpisodeDays).toBe(91); expect(precise.latestEpisodeSource).toBeNull();
    expect(precise.time.activeDays).toBe(91); expect(precise.time.calendarDays).toBe(91);
  });
  it("allows a dated current count from truncated observation history without claiming campaign totals", () => {
    const result = researchListingTime(noStartProperty, sourceHistory({ truncated: true }));
    expect(result.time.latestEpisodeDays).toBe(464); expect(result.time.activeDays).toBeNull(); expect(result.time.calendarDays).toBeNull();
  });
  it("never reinterprets the source's total duration as current duration", () => {
    const result = researchListingTime(noStartProperty, sourceHistory({ observations: [{ ...observed, value: { latestEpisodeDays: null, totalDays: 464 } }] }));
    expect(result.time.latestEpisodeDays).toBeNull(); expect(result.latestEpisodeSource).toBeNull();
  });
  it("preserves zero as an observed current count", () => {
    expect(researchListingTime(noStartProperty, sourceHistory({ observations: [{ ...observed, value: { latestEpisodeDays: 0, totalDays: 464 } }] })).time.latestEpisodeDays).toBe(0);
  });
  it("cannot bypass episode/campaign identity ambiguity or an impossible current episode", () => {
    const alternatives: Partial<ResearchHistoryResponse>[] = [
      { episodes: [current, { ...current, id: "duplicate" }] }, { episodes: [{ ...current, sourceListingId: "other-case" }] },
      { episodes: [{ ...current, endDate: ago(1) }] }, { episodes: [{ ...current, observedAt: "2026-09-27T12:00:00Z" }] },
      { campaigns: [] }, { campaigns: [{ ...campaign(), observedAt: "2027-01-01T00:00:00Z" }] },
      { episodes: [current, episode({ id: "parallel", source: "boliga", sourceListingId: "parallel", campaignId: "another" })] },
    ];
    for (const change of alternatives) {
      const result = researchListingTime(noStartProperty, sourceHistory(change));
      expect(result.time.latestEpisodeDays).toBeNull(); expect(result.latestEpisodeSource).toBeNull();
    }
  });
  it.each(["paused", "removed", "sold", "relisted"] as const)("cannot override a conflicting %s event on the current episode", eventType => {
    const result = researchListingTime(noStartProperty, sourceHistory({ events: [event({ eventType, eventDate: ago(10), price: null })] }));
    expect(result.time.latestEpisodeDays).toBeNull(); expect(result.latestEpisodeSource).toBeNull();
  });
  it("cannot override a contradictory known listing date, month-precise start or current first-listing event", () => {
    expect(researchListingTime(property, sourceHistory()).time.latestEpisodeDays).toBeNull();
    expect(researchListingTime(noStartProperty, sourceHistory({ episodes: [{ ...current, startDate: ago(30), datePrecision: "month" }] })).time.latestEpisodeDays).toBeNull();
    expect(researchListingTime(noStartProperty, sourceHistory({ events: [event({ eventDate: ago(20) })] })).time.latestEpisodeDays).toBeNull();
    expect(researchListingTime({ ...property, listingDate: "2026-02-30" }, sourceHistory()).time.latestEpisodeDays).toBeNull();
  });
  it("can corroborate a known start without inferring another start from the count", () => {
    const result = researchListingTime({ ...property, listingDate: ago(464) }, sourceHistory());
    expect(result.time.latestEpisodeDays).toBe(464); expect(result.latestEpisodeSource?.kind).toBe("source_reported");
    expect(result.time.activeDays).toBeNull(); expect(result.time.calendarDays).toBeNull();
  });
  it("does not turn mock/future/unrelated/conflicting counts into current valuation duration", () => {
    for (const change of [{ dataMode: "mock" }, { episodeId: "another" }, { verificationStatus: "conflict" },
      { observedAt: "2026-09-26T18:00:00Z" }, { observedAt: "2026-09-27T08:00:00Z", effectiveDate: "2026-09-27" }] as Partial<ResearchObservation>[]) {
      expect(researchListingTime(noStartProperty, sourceHistory({ observations: [{ ...observed, ...change }] })).time.latestEpisodeDays).toBeNull();
    }
    expect(researchListingTime({ ...noStartProperty, dataMode: "mock" }, sourceHistory()).time.latestEpisodeDays).toBeNull();
    expect(researchListingTime(noStartProperty, sourceHistory({ observations: [observed, { ...observed, id: "conflict", value: { latestEpisodeDays: 465 } }] })).time.latestEpisodeDays).toBeNull();
  });
});

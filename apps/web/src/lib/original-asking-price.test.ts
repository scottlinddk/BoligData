import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Property } from "@shared/types/index";
import type { ResearchHistoryResponse, ResearchObservation } from "@shared/types/research-api";
import { originalAskingPrice } from "./original-asking-price";

const NOW = "2026-09-28T12:00:00Z";
const property = { id: "subject", externalId: "case-1", listingSource: "boligsiden", status: "active", dataMode: "real",
  listingDate: null, price: 4_900_000 } as Property;
const observation = (changes: Partial<ResearchObservation> = {}): ResearchObservation => ({
  id: "original", propertyId: property.id, episodeId: "episode", fieldName: "original_asking_price",
  value: { price: 5_500_000, sourceListingId: "case-1", scope: "listing", originalDate: null },
  source: "boligsiden", sourceUrl: "https://www.boligsiden.dk/case/case-1", effectiveDate: null, datePrecision: "unknown",
  observedAt: NOW, method: "source_reported_original_asking", verificationStatus: "unverified", dataMode: "real",
  sourceFile: null, sourceSheet: null, sourceRow: null, sourceVersion: "case/1", conflictGroup: null, ...changes,
});
const history = (changes: Partial<ResearchHistoryResponse> = {}): ResearchHistoryResponse => ({
  campaigns: [], episodes: [{ id: "episode", propertyId: property.id, campaignId: null, source: "boligsiden",
    sourceListingId: "case-1", sourceUrl: null, startDate: null, endDate: null, datePrecision: "unknown", status: "active",
    agentName: null, observedAt: NOW, dataMode: "real" }], events: [], transactions: [], observations: [observation()],
  conditionEvidence: [], dataVersion: "test/1", retrievedAt: NOW, truncated: false, ...changes,
});
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)); });
afterEach(() => vi.useRealTimers());

describe("exact source original asking price", () => {
  it("accepts an exact amount without inventing an original date or campaign", () => {
    const data = history();
    const before = structuredClone(data);
    expect(originalAskingPrice(property, data)).toMatchObject({ status: "available", evidence: {
      price: 5_500_000, originalDate: null, sourceListingId: "case-1", observedAt: NOW,
    } });
    expect(data).toEqual(before);
  });

  it("accepts source-confirmed price evidence on legacy unknown listings without upgrading the property", () => {
    for (const dataMode of ["unknown", undefined] as const) {
      expect(originalAskingPrice({ ...property, dataMode }, history()).status).toBe("available");
    }
    for (const changes of [{ dataMode: "mock" }, { dataMode: "demo" }, { status: "sold" }, { status: "withdrawn" }, { listingSource: "boliga" }]) {
      expect(originalAskingPrice({ ...property, ...changes } as Property, history()).status).toBe("missing");
    }
  });

  it("keeps the original independent of current asking price changes", () => {
    for (const price of [4_900_000, 4_500_000, 6_000_000, 0, Number.NaN]) {
      expect(originalAskingPrice({ ...property, price }, history()).evidence?.price).toBe(5_500_000);
    }
  });

  it("uses an independently complete exact slice even when ordinary observations are truncated", () => {
    const data = history({ observations: [], truncated: true, originalAskingEvidence: {
      propertyId: property.id, complete: true, observations: [observation()],
    } });
    expect(originalAskingPrice(property, data).status).toBe("available");
    data.originalAskingEvidence!.complete = false;
    expect(originalAskingPrice(property, data).status).toBe("incomplete");
    delete data.originalAskingEvidence;
    expect(originalAskingPrice(property, data).status).toBe("incomplete");
  });

  it("does not borrow another property, source, listing case or episode's original", () => {
    for (const changes of [{ propertyId: "other" }, { source: "boliga" }, { episodeId: "previous-episode" }, { dataMode: "mock" as const }]) {
      expect(originalAskingPrice(property, history({ observations: [observation(changes)] })).status).toBe("missing");
    }
    expect(originalAskingPrice(property, history({ observations: [observation({
      value: { price: 5_500_000, sourceListingId: "previous-case", scope: "listing", originalDate: null },
    })] })).status).toBe("invalid");
    expect(originalAskingPrice(property, history({ originalAskingEvidence: { propertyId: "other", complete: true, observations: [observation()] } })).status).toBe("invalid");
  });

  it("rejects ambiguous, ended, mock and future episode identities", () => {
    const duplicate = history(); duplicate.episodes.push({ ...duplicate.episodes[0]!, id: "duplicate" });
    expect(originalAskingPrice(property, duplicate).status).toBe("invalid");
    for (const changes of [{ endDate: "2026-09-28" }, { dataMode: "mock" }, { observedAt: "2026-09-28T13:00:00Z" }, { startDate: "2027-01-01", datePrecision: "day" }]) {
      const data = history(); Object.assign(data.episodes[0]!, changes);
      expect(originalAskingPrice(property, data).status).toBe("invalid");
    }
  });

  it("keeps original dates separate from the latest listing episode start", () => {
    const data = history({ observations: [observation({ effectiveDate: "2026-01-01", datePrecision: "day",
      value: { price: 5_500_000, sourceListingId: "case-1", scope: "listing", originalDate: "2026-01-01" },
    })] });
    data.episodes[0] = { ...data.episodes[0]!, startDate: "2026-08-01", datePrecision: "day" };
    expect(originalAskingPrice(property, data).evidence?.originalDate).toBe("2026-01-01");
    expect(data.episodes[0]!.startDate).toBe("2026-08-01");
  });

  it.each([
    { observedAt: "2026-09-28T13:00:00Z" }, { observedAt: "2026-02-30T12:00:00Z" },
    { effectiveDate: "2026-09-28", datePrecision: "day" }, { method: "unknown" }, { verificationStatus: "unavailable" },
    { value: { price: 0, sourceListingId: "case-1", scope: "listing", originalDate: null } },
    { value: { price: 5_500_000, sourceListingId: "case-1", scope: "address", originalDate: null } },
    { value: { price: 5_500_000, sourceListingId: "case-1", scope: "listing", originalDate: "2027-01-01" } },
  ])("does not resurrect older originals behind invalid latest evidence: %j", changes => {
    const older = observation({ id: "old", observedAt: "2026-09-27T12:00:00Z" });
    expect(originalAskingPrice(property, history({ observations: [older, observation(changes as Partial<ResearchObservation>)] })).status).toBe("invalid");
  });

  it("preserves conflicting originals across observations and never chooses whichever is newest", () => {
    const data = history({ observations: [observation({ id: "old", observedAt: "2026-09-27T12:00:00Z",
      value: { price: 6_000_000, sourceListingId: "case-1", scope: "listing", originalDate: null },
    }), observation()] });
    expect(originalAskingPrice(property, data).status).toBe("conflict");
    expect(originalAskingPrice(property, history({ observations: [observation({ verificationStatus: "conflict" })] })).status).toBe("conflict");
    expect(originalAskingPrice(property, history({ observations: [observation({ id: "unresolved", observedAt: "2026-09-27T12:00:00Z",
      verificationStatus: "conflict" }), observation()] })).status).toBe("conflict");
  });

  const totalPeriod = (changes: Partial<ResearchObservation> = {}) => observation({ sourceVersion: "original-price-backfill/v2",
    effectiveDate: "2025-09-20", datePrecision: "day",
    value: { price: 6_498_000, sourceListingId: "case-1", scope: "listing", originalDate: "2025-09-20", priceScope: "total_marketing_period", totalDays: 373 }, ...changes });
  const brokerPeriod = (changes: Partial<ResearchObservation> = {}) => observation({ id: "old-broker-price", sourceVersion: "original-price-backfill/v1",
    effectiveDate: "2026-03-26", datePrecision: "day",
    value: { price: 6_250_000, sourceListingId: "case-1", scope: "listing", originalDate: "2026-03-26" }, ...changes });

  it("uses the total-period opening across broker changes and retains the old derivation for auditing", () => {
    const data = history({ observations: [brokerPeriod({ verificationStatus: "conflict", conflictGroup: "source_original_price_conflict" }),
      totalPeriod({ observedAt: "2026-09-27T12:00:00Z" })] });
    const before = structuredClone(data);
    expect(originalAskingPrice(property, data)).toMatchObject({ status: "available", evidence: {
      price: 6_498_000, originalDate: "2025-09-20", priceScope: "total_marketing_period",
    } });
    expect(data).toEqual(before);
  });

  it("does not downgrade the total-period price when a newer refresh only proves the current listing", () => {
    const data = history({ observations: [totalPeriod({ observedAt: "2026-09-27T12:00:00Z" }), brokerPeriod({
      value: { price: 6_250_000, sourceListingId: "case-1", scope: "listing", originalDate: "2026-03-26", priceScope: "current_listing", totalDays: null },
    })] });
    expect(originalAskingPrice(property, data).evidence?.price).toBe(6_498_000);
  });

  it.each(["original-price-backfill/v2", "manual-review/1", null])("keeps conflicts from total-period and unrelated versions %j", sourceVersion => {
    const other = sourceVersion === "original-price-backfill/v2" ? totalPeriod({ id: "other", observedAt: "2026-09-27T12:00:00Z",
      value: { price: 6_700_000, sourceListingId: "case-1", scope: "listing", originalDate: "2025-09-20", priceScope: "total_marketing_period", totalDays: 372 },
    }) : brokerPeriod({ sourceVersion, observedAt: "2026-09-27T12:00:00Z" });
    expect(originalAskingPrice(property, history({ observations: [other, totalPeriod()] })).status).toBe("conflict");
  });

  it("keeps newer invalid and any conflicted v2 evidence visible", () => {
    for (const overrides of [{ verificationStatus: "conflict" as const }, { method: "unknown" }, { observedAt: "2026-09-28T13:00:00Z" }]) {
      const data = history({ observations: [brokerPeriod(), totalPeriod({ observedAt: "2026-09-27T12:00:00Z" }), totalPeriod({ id: "invalid", ...overrides })] });
      expect(originalAskingPrice(property, data).status).toBe(overrides.verificationStatus === "conflict" ? "conflict" : "invalid");
    }
  });

  it.each([null, -1, 1.5, 36_501])("does not supersede the broker opening with invalid total duration %j", totalDays => {
    const data = history({ observations: [brokerPeriod({ observedAt: "2026-09-27T12:00:00Z" }), totalPeriod({
      value: { price: 6_498_000, sourceListingId: "case-1", scope: "listing", originalDate: "2025-09-20", priceScope: "total_marketing_period", totalDays },
    })] });
    expect(originalAskingPrice(property, data).status).toBe("invalid");
  });

  it("never supersedes a current case with another episode's total-period original", () => {
    const data = history({ observations: [brokerPeriod(), totalPeriod({ episodeId: "previous-episode" })] });
    expect(originalAskingPrice(property, data).evidence?.price).toBe(6_250_000);
    expect(originalAskingPrice(property, data).evidence?.priceScope).toBe("current_listing");
  });

  it("identifies retained legacy and explicit current-listing evidence as a broker-scoped original", () => {
    for (const row of [brokerPeriod(), brokerPeriod({ sourceVersion: "case/1", value: {
      price: 6_250_000, sourceListingId: "case-1", scope: "listing", originalDate: "2026-03-26", priceScope: "current_listing",
    } })]) {
      expect(originalAskingPrice(property, history({ observations: [row] }))).toMatchObject({
        status: "available", evidence: { price: 6_250_000, priceScope: "current_listing" },
      });
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  estimateResearchPrice, type ResearchPriceEstimateInput, type ResearchPriceSubject, type ResearchTransaction,
} from "@shared/analysis";

const subject: ResearchPriceSubject = {
  propertyId: "subject", unitId: "subject-unit", propertyType: "villa", municipality: "Aalborg",
  residentialArea: 140, areaEvidence: "verified", dataMode: "live", firstAsking: 4_600_000,
  firstAskingDocumented: true, daysOnMarket: 120, timeDefinition: "latest_episode_days",
};

function sale(index: number, changes: Partial<ResearchTransaction> = {}): ResearchTransaction {
  return {
    id: `sale-${index}`, transactionIdentity: `registered-sale-${index}`, propertyId: `property-${index}`, unitId: null,
    address: `Referencevej ${index + 1}`, municipality: "Aalborg", postalCode: "9000", propertyType: "villa", saleType: "normal",
    saleDate: "2025-05-01", observedAt: "2026-09-20T12:00:00Z", firstAsking: 5_000_000, lastAsking: 4_700_000,
    soldPrice: (22_000 + index * 2_000) * 140, residentialArea: 140, areaDefinition: "residential", areaAtSale: true,
    areaEvidence: "verified", activeDays: 447, latestEpisodeDays: 91, calendarDays: 500,
    condition: null, dataMode: "live", status: "sold", source: "Documented test registration", ...changes,
  };
}

function input(transactions = Array.from({ length: 6 }, (_, index) => sale(index)), overrides: Partial<ResearchPriceEstimateInput> = {}): ResearchPriceEstimateInput {
  return { subject: { ...subject }, transactions, dataVersion: "registered-sales/v1", calculatedAt: "2026-09-26T12:00:00Z", ...overrides };
}

describe("data-based listing price reference", () => {
  it("publishes a distinct area-scaled median and middle-half range from matching real sales", () => {
    const result = estimateResearchPrice(input());
    expect(result.status).toBe("available");
    expect(result.primary).toMatchObject({ status: "available", count: 6, propertyCount: 6, median: 3_780_000, q1: 3_430_000, q3: 4_130_000 });
    expect(result.primary.transactionIds).toEqual(Array.from({ length: 6 }, (_, i) => `sale-${i}`));
    expect(result.timeGroup).toEqual({ label: "91–180", min: 91, max: 180 });
    expect(result.warnings.map(warning => warning.code)).toContain("thin_time_group_sample");
    expect(result.warnings.every(warning => warning.message && warning.messageEn)).toBe(true);
    expect(result.warnings.find(warning => warning.code === "descriptive_time_group")?.messageEn).toContain("not an effect of waiting");
  });

  it("excludes non-market, unmatched, undated-area, subject and future records without broadening the cohort", () => {
    const bad: Partial<ResearchTransaction>[] = [
      { dataMode: "mock" }, { dataMode: "unavailable" }, { saleType: "family" }, { saleType: "auction" }, { saleType: null },
      { status: "active" }, { status: "withdrawn" }, { propertyType: "apartment" }, { municipality: "København" },
      { residentialArea: 104 }, { residentialArea: 176 }, { areaDefinition: "weighted" }, { areaEvidence: "unknown" },
      { areaEvidence: "conflicting" }, { areaAtSale: false }, { saleDate: "2024-09-25" }, { saleDate: "2027-01-01" },
      { observedAt: "2026-10-01T12:00:00Z" }, { propertyId: "subject" }, { unitId: "subject-unit" }, { transactionIdentity: "" },
    ];
    const request = input([...input().transactions, ...bad.map((changes, index) => sale(100 + index, changes))]);
    const result = estimateResearchPrice(request);
    expect(result.primary.count).toBe(6);
    expect(result.baseline.count).toBe(6);
    expect(result.excluded.filter(row => row.scope === "baseline")).toHaveLength(bad.length);
    expect(result.excluded.filter(row => row.code === "subject_property")).toHaveLength(2);
    expect(result.warnings.map(row => row.code)).toContain("historical_area_missing");
  });

  it("includes documented area and calendar-month lookback boundaries precisely", () => {
    const result = estimateResearchPrice(input([
      ...input().transactions,
      sale(10, { residentialArea: 105, soldPrice: 105 * 30_000, saleDate: "2024-09-26" }),
      sale(11, { residentialArea: 175, soldPrice: 175 * 30_000 }),
      sale(12, { residentialArea: 104.99 }), sale(13, { residentialArea: 175.01 }),
    ]));
    expect(result.primary.count).toBe(8);
    expect(result.snapshot.filters.baseline).toMatchObject({ minArea: 105, maxArea: 175, saleFrom: "2024-09-26", saleTo: "2026-09-26", saleTypes: ["normal"] });
    const leapRequest = input(Array.from({ length: 5 }, (_, index) => sale(index, { saleDate: "2022-02-28", observedAt: "2024-02-29" })), { calculatedAt: "2024-02-29" });
    expect(estimateResearchPrice(leapRequest).snapshot.filters.baseline.saleFrom).toBe("2022-02-28");
    expect(estimateResearchPrice(leapRequest).primary.count).toBe(5);
  });

  it("requires five unique transactions rather than five source rows", () => {
    const four = Array.from({ length: 4 }, (_, index) => sale(index));
    const duplicate = { ...four[0]!, id: "second-source", source: "Other register" };
    const result = estimateResearchPrice(input([...four, duplicate]));
    expect(result.status).toBe("insufficient_data");
    expect(result.primary).toMatchObject({ count: 4, median: null, q1: null, q3: null });
    expect(result.baseline.median).toBeNull();
    expect(result.firstAskingReference.median).toBeNull();
    expect(result.noDataReasons.map(reason => reason.code)).toContain("insufficient_time_group_sales");
  });

  it("preserves conflicting-source exclusions before any area-at-sale filter", () => {
    const rows = Array.from({ length: 5 }, (_, index) => sale(index));
    const conflict = { ...rows[0]!, id: "later-area-source", soldPrice: rows[0]!.soldPrice! + 1, areaAtSale: false };
    const result = estimateResearchPrice(input([...rows, conflict]));
    expect(result.primary.count).toBe(4);
    expect(result.primary.median).toBeNull();
    expect(result.excluded.filter(row => row.reason.includes("Modstridende kilder"))).toHaveLength(2);
  });

  it("cascades a manual exclusion of either duplicate source to the verified transaction", () => {
    const rows = Array.from({ length: 5 }, (_, index) => sale(index));
    const duplicate = { ...rows[0]!, id: "zz-excluded-source", source: "Other source" };
    for (const excludedTransactionIds of [[duplicate.id], [rows[0]!.transactionIdentity]]) {
      const result = estimateResearchPrice(input([...rows, duplicate], { excludedTransactionIds }));
      expect(result.primary.count).toBe(4);
      expect(result.primary.transactionIds).not.toContain("sale-0");
      expect(result.excluded.filter(row => row.code === "user_exclusion")).toHaveLength(2);
    }
  });

  it("shows a baseline separately when documented subject time is unavailable", () => {
    const result = estimateResearchPrice(input(undefined, { subject: { ...subject, daysOnMarket: null } }));
    expect(result.status).toBe("missing_subject_data");
    expect(result.primary).toMatchObject({ status: "unavailable", median: null, count: 0 });
    expect(result.baseline).toMatchObject({ status: "available", count: 6, median: 3_780_000 });
    expect(result.timeGroup).toBeNull();
    expect(result.snapshot.filters.timeMatched).toBeNull();
    expect(result.noDataReasons.map(reason => reason.code)).toContain("subject_time_missing");
  });

  it("never compares 447 active days against 91 latest-episode days", () => {
    const wrongDefinition = estimateResearchPrice(input(undefined, { subject: { ...subject, daysOnMarket: 91, timeDefinition: "active_days" } }));
    expect(wrongDefinition.primary.count).toBe(0);
    expect(wrongDefinition.baseline.count).toBe(6);
    const correctlyMatched = estimateResearchPrice(input(undefined, { subject: { ...subject, daysOnMarket: 447, timeDefinition: "active_days" } }));
    expect(correctlyMatched.primary.count).toBe(6);
    expect(correctlyMatched.timeGroup?.min).toBe(366);
  });

  it.each([[0, 0], [30, 0], [31, 31], [90, 31], [91, 91], [180, 91], [181, 181], [365, 181], [366, 366]])("places subject duration %i in the correct fixed bin", (daysOnMarket, min) => {
    expect(estimateResearchPrice(input(undefined, { subject: { ...subject, daysOnMarket } })).timeGroup?.min).toBe(min);
  });

  it("keeps baseline and time-matched estimates separate instead of stacking a time discount", () => {
    const primaryRows = Array.from({ length: 6 }, (_, index) => sale(index, { soldPrice: 4_200_000 }));
    const otherTimeRows = Array.from({ length: 6 }, (_, index) => sale(index + 10, { soldPrice: 5_600_000, latestEpisodeDays: 250 }));
    const result = estimateResearchPrice(input([...primaryRows, ...otherTimeRows]));
    expect(result.primary).toMatchObject({ count: 6, median: 4_200_000 });
    expect(result.baseline).toMatchObject({ count: 12, median: 4_900_000 });
    expect(result.firstAskingReference.median).toBeCloseTo(3_864_000);
    expect(result.excluded.filter(row => row.scope === "time_group")).toHaveLength(6);
  });

  it("requires a separate five-pair sample for the optional first-asking reference", () => {
    const rows = Array.from({ length: 6 }, (_, index) => sale(index, { firstAsking: index < 4 ? 5_000_000 : null }));
    const result = estimateResearchPrice(input(rows));
    expect(result.primary.status).toBe("available");
    expect(result.firstAskingReference).toMatchObject({ status: "insufficient_data", count: 4, median: null, medianTotalFallPercent: null });
    expect(result.warnings.map(warning => warning.code)).toContain("insufficient_first_asking_pairs");
  });

  it("preserves negative historical price falls and anchors only to documented first asking", () => {
    const rows = Array.from({ length: 5 }, (_, index) => sale(index, { firstAsking: 4_000_000, soldPrice: 4_200_000 }));
    const result = estimateResearchPrice(input(rows));
    expect(result.firstAskingReference.medianTotalFallPercent).toBe(-5);
    expect(result.firstAskingReference.median).toBe(4_830_000);
    expect(result.firstAskingReference.q1).toBe(4_830_000);
    const undocumented = estimateResearchPrice(input(rows, { subject: { ...subject, firstAskingDocumented: false } }));
    expect(undocumented.primary.status).toBe("available");
    expect(undocumented.firstAskingReference).toMatchObject({ status: "unavailable", median: null });
    expect(undocumented.warnings.map(warning => warning.code)).toContain("missing_first_asking");
  });

  it("orders secondary price quartiles correctly when larger falls imply lower prices", () => {
    const rows = Array.from({ length: 5 }, (_, index) => sale(index, { firstAsking: 5_000_000, soldPrice: 5_000_000 * (1 - index / 10) }));
    const result = estimateResearchPrice(input(rows));
    expect(result.firstAskingReference).toMatchObject({ count: 5, median: 3_680_000, q1: 3_220_000, q3: 4_140_000, medianTotalFallPercent: 20 });
  });

  it("returns reasons instead of widening criteria when required subject evidence is missing", () => {
    const cases: [Partial<ResearchPriceSubject>, string][] = [
      [{ dataMode: "mock" }, "subject_not_live"], [{ dataMode: "unavailable" }, "subject_not_live"],
      [{ residentialArea: 0 }, "subject_area_missing"], [{ residentialArea: null }, "subject_area_missing"],
      [{ areaEvidence: "unknown" }, "subject_area_missing"], [{ areaEvidence: "conflicting" }, "subject_area_conflicting"],
      [{ propertyType: null }, "subject_property_type_missing"], [{ municipality: " " }, "subject_municipality_missing"],
    ];
    for (const [changes, code] of cases) {
      const result = estimateResearchPrice(input(undefined, { subject: { ...subject, ...changes } }));
      expect(result.status).toBe("missing_subject_data");
      expect(result.primary.median).toBeNull();
      expect(result.baseline.median).toBeNull();
      expect(result.noDataReasons.map(reason => reason.code)).toContain(code);
    }
    expect(estimateResearchPrice(input(undefined, { calculatedAt: "2026-02-30" })).noDataReasons.map(reason => reason.code)).toContain("invalid_calculated_at");
  });

  it("labels reported area, repeated property sales and partial input without hiding sample counts", () => {
    const rows = Array.from({ length: 10 }, (_, index) => sale(index, { propertyId: "repeat-property" }));
    const result = estimateResearchPrice(input(rows, { partialDataset: true, subject: { ...subject, areaEvidence: "reported" } }));
    expect(result.primary).toMatchObject({ count: 10, propertyCount: 1, status: "available" });
    const codes = result.warnings.map(warning => warning.code);
    expect(codes).toContain("subject_area_reported");
    expect(codes).toContain("repeated_property_sales");
    expect(codes).toContain("partial_dataset");
    expect(codes).not.toContain("thin_time_group_sample");
  });

  it("exports an independent reproducible snapshot and never accepts asking/budget as a price method", () => {
    const request = input();
    const result = estimateResearchPrice(request);
    request.subject.residentialArea = 900;
    request.transactions[0]!.soldPrice = 10;
    expect(result.snapshot.subject.residentialArea).toBe(140);
    expect(result.snapshot.sourceTransactions[0]!.soldPrice).toBe(3_080_000);
    const replay = estimateResearchPrice({ subject: result.snapshot.subject, transactions: result.snapshot.sourceTransactions, excludedTransactionIds: result.snapshot.excludedTransactionIds, dataVersion: result.snapshot.dataVersion, calculatedAt: result.snapshot.calculatedAt, partialDataset: result.snapshot.partialDataset });
    expect(replay.primary).toEqual(result.primary);
    expect(replay.firstAskingReference).toEqual(result.firstAskingReference);
    const extras = { ...input(), budget: 1, currentAsking: 9_000_000, subject: { ...subject, budget: 1, currentAsking: 9_000_000 } };
    const ignored = estimateResearchPrice(extras);
    expect(ignored.primary).toEqual(result.primary);
    expect(ignored.firstAskingReference).toEqual(result.firstAskingReference);
    expect(JSON.stringify(ignored.snapshot)).not.toContain('"budget"');
    expect(JSON.stringify(ignored.snapshot)).not.toContain('"currentAsking"');
  });
});

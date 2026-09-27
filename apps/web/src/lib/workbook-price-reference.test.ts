import { describe, expect, it } from "vitest";
import {
  calculateWorkbookPriceReference, WORKBOOK_PRICE_REFERENCE_MODEL,
  type WorkbookPriceReferenceInput,
} from "@shared/analysis";
import audit from "@shared/data/liggetid-transactions-2026-09-27.json";

const example: WorkbookPriceReferenceInput = {
  firstAsking: 5_500_000, currentAsking: 5_200_000, latestEpisodeDays: 188,
  propertyType: "villa", postalCode: "9000",
};

describe("workbook liggetid reference", () => {
  it("reproduces Prisberegner row 14, including inverted discount quartiles and current-price gap", () => {
    const reference = calculateWorkbookPriceReference(example);
    expect(reference).toMatchObject({
      status: "available", referencePrice: 4_800_000, lowerPrice: 4_650_000,
      upperPrice: 5_100_000, gapAmount: 400_000,
      bracket: { fromDays: 181, toDays: 240, count: 22 },
      metadata: { eligibleCount: 281, rowCount: 437, snapshotDate: "2026-09-27" },
    });
    expect(reference.gapPercent).toBeCloseTo(7.6923076923);
    expect(reference.medianDiscountPercent).toBeCloseTo(12.4985251124);
  });

  it("preserves all historical records, URLs, eligibility reasons and reconciliation", () => {
    expect(audit.records).toHaveLength(437);
    expect(audit.records.filter((record) => record.eligible)).toHaveLength(281);
    expect(audit.selectionCounts).toEqual({
      "Medtaget": 281, "Prispar mangler": 103,
      "Liggetid mangler eller afviger": 36, "Usikkert prispar": 17,
    });
    expect(audit.metadata.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(audit.records.every((record) => record.sourceUrl?.startsWith("https://www.boligsiden.dk/"))).toBe(true);
    expect(audit.records.every((record) => typeof record.fullHistory === "string")).toBe(true);
    const eligible = audit.records.filter((record) => record.eligible);
    expect(Math.min(...eligible.map((record) => record.latestEpisodeDays!))).toBe(2);
    expect(Math.max(...eligible.map((record) => record.latestEpisodeDays!))).toBe(797);
    const brackets = WORKBOOK_PRICE_REFERENCE_MODEL.brackets;
    expect(brackets).toHaveLength(10);
    expect(brackets.reduce((sum, bracket) => sum + bracket.count, 0)).toBe(281);
    for (const bracket of brackets) {
      const values = eligible.filter((record) => record.latestEpisodeDays! >= bracket.fromDays
        && record.latestEpisodeDays! <= bracket.toDays)
        .map((record) => record.calculatedDiscountFraction!).sort((a, b) => a - b);
      const percentile = (p: number) => {
        const index = (values.length - 1) * p;
        const lower = values[Math.floor(index)]!;
        return lower + (values[Math.ceil(index)]! - lower) * (index - Math.floor(index));
      };
      expect(values).toHaveLength(bracket.count);
      expect(bracket.medianDiscountFraction).toBeCloseTo(percentile(.5), 12);
      expect(bracket.q1DiscountFraction).toBeCloseTo(percentile(.25), 10);
      expect(bracket.q3DiscountFraction).toBeCloseTo(percentile(.75), 10);
    }
  });

  it("assigns both inclusive endpoints without leakage between neighboring brackets", () => {
    for (const bracket of WORKBOOK_PRICE_REFERENCE_MODEL.brackets) {
      for (const days of [Math.max(2, bracket.fromDays), Math.min(797, bracket.toDays)]) {
        const result = calculateWorkbookPriceReference({ ...example, latestEpisodeDays: days });
        expect(result.status).toBe("available");
        expect(result.bracket?.label).toBe(bracket.label);
      }
    }
  });

  it.each([0, 1, 798, 99999])("does not extrapolate to %i days", (latestEpisodeDays) => {
    expect(calculateWorkbookPriceReference({ ...example, latestEpisodeDays })).toMatchObject({
      status: "outside_observed_range", referencePrice: null,
    });
  });

  it.each([null, -1, 14.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects missing/invalid latest-period days %s", (latestEpisodeDays) => {
    expect(calculateWorkbookPriceReference({ ...example, latestEpisodeDays }).status).toBe("missing_days");
  });

  it.each([null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])("requires documented first asking %s", (firstAsking) => {
    expect(calculateWorkbookPriceReference({ ...example, firstAsking })).toMatchObject({
      status: "missing_first_asking", referencePrice: null,
    });
  });

  it("can show the historical reference without inventing a gap when current asking is missing", () => {
    expect(calculateWorkbookPriceReference({ ...example, currentAsking: null })).toMatchObject({
      status: "available", referencePrice: 4_800_000, gapAmount: null, gapPercent: null,
    });
  });

  it.each([{ propertyType: "ejerlejlighed" }, { postalCode: "8000" }, { propertyType: null }, { postalCode: null }])("blocks unsupported or unknown property scope %j", (scope) => {
    expect(calculateWorkbookPriceReference({ ...example, ...scope })).toMatchObject({
      status: "outside_scope", referencePrice: null,
    });
  });

  it("does not display a price below the workbook's minimum sample size", () => {
    const model = structuredClone(WORKBOOK_PRICE_REFERENCE_MODEL);
    model.brackets = model.brackets.map((bracket) => ({ ...bracket, count: 14 }));
    expect(calculateWorkbookPriceReference(example, model)).toMatchObject({
      status: "insufficient_sample", referencePrice: null,
    });
  });

  it("retains sale-above-asking discounts, negative gaps and workbook rounding", () => {
    expect(audit.records.some((record) => record.eligible && record.calculatedDiscountFraction! < 0)).toBe(true);
    const model = structuredClone(WORKBOOK_PRICE_REFERENCE_MODEL);
    model.brackets = model.brackets.map((bracket) => ({
      ...bracket, medianDiscountFraction: -.05, q1DiscountFraction: -.1, q3DiscountFraction: 0,
    }));
    expect(calculateWorkbookPriceReference({ ...example, firstAsking: 4_000_000, currentAsking: 4_000_000 }, model))
      .toMatchObject({ status: "available", referencePrice: 4_200_000, lowerPrice: 4_000_000,
        upperPrice: 4_400_000, medianDiscountPercent: -5, gapAmount: -200_000, gapPercent: -5 });
    expect(calculateWorkbookPriceReference({ ...example, currentAsking: 4_500_000 }).gapAmount).toBe(-300_000);
  });

  it("fails closed for overlapping brackets or invalid quartiles", () => {
    const model = structuredClone(WORKBOOK_PRICE_REFERENCE_MODEL);
    model.brackets = [...model.brackets, model.brackets[7]!];
    expect(calculateWorkbookPriceReference(example, model).status).toBe("invalid_model");
    model.brackets = WORKBOOK_PRICE_REFERENCE_MODEL.brackets.map((bracket) => ({ ...bracket, q3DiscountFraction: 1 }));
    expect(calculateWorkbookPriceReference(example, model).status).toBe("invalid_model");
  });
});

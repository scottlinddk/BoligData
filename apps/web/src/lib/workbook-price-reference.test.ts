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
  it("uses workbook discounts with 10,000-kr rounding, inverted quartiles and current-price gap", () => {
    const reference = calculateWorkbookPriceReference(example);
    expect(reference).toMatchObject({
      status: "available", referencePrice: 4_810_000, lowerPrice: 4_660_000,
      upperPrice: 5_080_000, gapAmount: 390_000,
      priceBasis: "first_asking", timeBasis: "matched_bracket", baselinePrice: 5_500_000, latestEpisodeDays: 188,
      bracket: { fromDays: 181, toDays: 240, count: 22 },
      metadata: { eligibleCount: 281, rowCount: 437, snapshotDate: "2026-09-27", roundingDkk: 10_000, sourceRoundingDkk: 50_000 },
    });
    expect(reference.gapPercent).toBeCloseTo(7.5);
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
    for (const bracket of [...brackets, WORKBOOK_PRICE_REFERENCE_MODEL.aggregate]) {
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
      expect(bracket.meanDiscountFraction).toBeCloseTo(values.reduce((sum, value) => sum + value, 0) / values.length, 12);
    }
    expect(WORKBOOK_PRICE_REFERENCE_MODEL.aggregate).toMatchObject({ count: 281, fromDays: 2, toDays: 797 });
  });

  it("assigns both inclusive endpoints without leakage between neighboring brackets", () => {
    for (const bracket of WORKBOOK_PRICE_REFERENCE_MODEL.brackets) {
      for (const days of [Math.max(2, bracket.fromDays), Math.min(797, bracket.toDays)]) {
        const result = calculateWorkbookPriceReference({ ...example, latestEpisodeDays: days });
        expect(result.status).toBe("available");
        expect(result.bracket?.label).toBe(bracket.label);
        expect(result.timeBasis).toBe("matched_bracket");
      }
    }
  });

  it.each([0, 1, 798, 99999, 1_000_000])("uses the nearest observed group and retains the actual %i days", (latestEpisodeDays) => {
    expect(calculateWorkbookPriceReference({ ...example, latestEpisodeDays })).toMatchObject({
      status: "available", timeBasis: "nearest_bracket", latestEpisodeDays,
      referencePrice: latestEpisodeDays < 2 ? 5_450_000 : 4_900_000,
      bracket: { label: latestEpisodeDays < 2 ? "0–14" : "366+" },
    });
  });

  it.each([null, -1, 14.5, Number.NaN, Number.POSITIVE_INFINITY])("uses all raw sales without inventing a day for %s", (latestEpisodeDays) => {
    expect(calculateWorkbookPriceReference({ ...example, latestEpisodeDays })).toMatchObject({
      status: "available", timeBasis: "all_sales", latestEpisodeDays: null,
      referencePrice: 5_170_000, lowerPrice: 4_800_000, upperPrice: 5_350_000,
      bracket: { count: 281, label: "Alle liggetider" },
    });
  });

  it.each([null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])("uses an explicit current-price scenario when first asking is %s", (firstAsking) => {
    expect(calculateWorkbookPriceReference({ ...example, firstAsking })).toMatchObject({
      status: "available", priceBasis: "current_asking", baselinePrice: 5_200_000,
      timeBasis: "matched_bracket", referencePrice: 4_550_000, lowerPrice: 4_410_000, upperPrice: 4_800_000,
    });
  });

  it("combines missing first price and unknown duration without altering the supplied listing inputs", () => {
    const input = { ...example, firstAsking: null, latestEpisodeDays: null };
    const unchanged = structuredClone(input);
    expect(calculateWorkbookPriceReference(input)).toMatchObject({
      status: "available", priceBasis: "current_asking", baselinePrice: 5_200_000,
      timeBasis: "all_sales", latestEpisodeDays: null,
      referencePrice: 4_890_000, lowerPrice: 4_530_000, upperPrice: 5_060_000,
      bracket: { count: 281 },
    });
    expect(input).toEqual(unchanged);
  });

  it.each([null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])("does not invent a price when neither asking input is usable (%s)", value => {
    expect(calculateWorkbookPriceReference({ ...example, firstAsking: value, currentAsking: value })).toMatchObject({
      status: "missing_price", priceBasis: null, baselinePrice: null, referencePrice: null,
    });
  });

  it("can show the historical reference without inventing a gap when current asking is missing", () => {
    expect(calculateWorkbookPriceReference({ ...example, currentAsking: null })).toMatchObject({
      status: "available", referencePrice: 4_810_000, gapAmount: null, gapPercent: null,
    });
  });

  it.each([{ propertyType: "ejerlejlighed" }, { postalCode: "8000" }, { propertyType: null }, { postalCode: null }])("labels other or unknown property scope as a broad scenario %j", (scope) => {
    expect(calculateWorkbookPriceReference({ ...example, ...scope })).toMatchObject({
      status: "available", applicability: "broad_scenario", referencePrice: 4_810_000,
    });
  });

  it("keeps the observed discounts and count visible for the current-price fallback", () => {
    const result = calculateWorkbookPriceReference({ ...example, firstAsking: null });
    expect(result).toMatchObject({ status: "available", priceBasis: "current_asking", referencePrice: 4_550_000, bracket: { count: 22, label: "181–240" } });
    expect(result.medianDiscountPercent).toBeCloseTo(12.4985251124);
  });

  it("rounds all scenario bounds to the nearest 10,000, including halfway amounts", () => {
    const model = structuredClone(WORKBOOK_PRICE_REFERENCE_MODEL);
    model.brackets = model.brackets.map(bracket => ({ ...bracket, q1DiscountFraction: 0, medianDiscountFraction: 0, q3DiscountFraction: 0 }));
    expect(calculateWorkbookPriceReference({ ...example, firstAsking: 4_805_000 }, model)).toMatchObject({ referencePrice: 4_810_000, lowerPrice: 4_810_000, upperPrice: 4_810_000 });
    expect(calculateWorkbookPriceReference({ ...example, firstAsking: 4_804_999 }, model).referencePrice).toBe(4_800_000);
  });

  it("shows valid positive amounts that round to zero without accepting zero price inputs", () => {
    for (const firstAsking of [5_000, null]) {
      expect(calculateWorkbookPriceReference({ ...example, firstAsking, currentAsking: 5_000 })).toMatchObject({
        status: "available", baselinePrice: 5_000,
        priceBasis: firstAsking === null ? "current_asking" : "first_asking",
        referencePrice: 0, lowerPrice: 0, upperPrice: 0,
      });
    }
    expect(calculateWorkbookPriceReference({ ...example, firstAsking: 0, currentAsking: 0 })).toMatchObject({
      status: "missing_price", baselinePrice: null, referencePrice: null,
    });
  });

  it.each([1, 4, 14])("shows a scenario from %i observations rather than imposing a minimum sample", count => {
    const model = structuredClone(WORKBOOK_PRICE_REFERENCE_MODEL);
    model.brackets = model.brackets.map((bracket) => ({ ...bracket, count }));
    expect(calculateWorkbookPriceReference(example, model)).toMatchObject({
      status: "available", referencePrice: 4_810_000, bracket: { count },
    });
  });

  it("does not invent an observation when the selected group is empty", () => {
    const model = structuredClone(WORKBOOK_PRICE_REFERENCE_MODEL);
    model.brackets = model.brackets.map((bracket) => ({ ...bracket, count: 0 }));
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
    expect(calculateWorkbookPriceReference({ ...example, currentAsking: 4_500_000 }).gapAmount).toBe(-310_000);
  });

  it("fails closed for overlapping brackets or invalid quartiles", () => {
    const model = structuredClone(WORKBOOK_PRICE_REFERENCE_MODEL);
    model.brackets = [...model.brackets, model.brackets[7]!];
    expect(calculateWorkbookPriceReference(example, model).status).toBe("invalid_model");
    model.brackets = WORKBOOK_PRICE_REFERENCE_MODEL.brackets.map((bracket) => ({ ...bracket, q3DiscountFraction: 1 }));
    expect(calculateWorkbookPriceReference(example, model).status).toBe("invalid_model");
  });

  it("validates the pooled fallback instead of bypassing model checks for unknown days", () => {
    const model = structuredClone(WORKBOOK_PRICE_REFERENCE_MODEL);
    model.aggregate = { ...model.aggregate, q3DiscountFraction: 1 };
    expect(calculateWorkbookPriceReference({ ...example, latestEpisodeDays: null }, model).status).toBe("invalid_model");
    model.aggregate = { ...WORKBOOK_PRICE_REFERENCE_MODEL.aggregate, count: -1 };
    expect(calculateWorkbookPriceReference({ ...example, latestEpisodeDays: null }, model).status).toBe("invalid_model");
    model.aggregate = { ...WORKBOOK_PRICE_REFERENCE_MODEL.aggregate, count: 0 };
    expect(calculateWorkbookPriceReference({ ...example, latestEpisodeDays: null }, model).status).toBe("insufficient_sample");
  });

  it("rejects invalid rounding and observed bounds for both matched and pooled calculations", () => {
    for (const latestEpisodeDays of [188, null]) {
      const model = structuredClone(WORKBOOK_PRICE_REFERENCE_MODEL);
      model.metadata.roundingDkk = 0;
      expect(calculateWorkbookPriceReference({ ...example, latestEpisodeDays }, model).status).toBe("invalid_model");
      model.metadata.roundingDkk = 10_000;
      model.metadata.observedMaxDays = -1;
      expect(calculateWorkbookPriceReference({ ...example, latestEpisodeDays }, model).status).toBe("invalid_model");
    }
  });
});

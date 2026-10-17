import { describe, expect, it } from "vitest";
import { compareAskingToValuation } from "@shared/analysis/valuation-comparison";

const base = { askingPrice: 4_200_000, ejendomsvaerdi: 3_984_000, kind: "foreloebig" as const, year: 2024 };

describe("compareAskingToValuation", () => {
  it("reports difference, percent and a within band for a small gap", () => {
    const result = compareAskingToValuation(base);
    expect(result).toMatchObject({ status: "available", differenceDkk: 216_000, percent: 5.4, band: "within", vintageKnown: true, kind: "foreloebig", year: 2024 });
  });

  it("flags gaps outside the +/-20 % tolerance in both directions", () => {
    expect(compareAskingToValuation({ ...base, askingPrice: 5_200_000 })).toMatchObject({ band: "above" });
    expect(compareAskingToValuation({ ...base, askingPrice: 3_000_000 })).toMatchObject({ band: "below" });
  });

  it("treats exactly 20 % as within the tolerance", () => {
    expect(compareAskingToValuation({ ...base, askingPrice: 4_800_000, ejendomsvaerdi: 4_000_000 })).toMatchObject({ band: "within" });
  });

  it("marks an unknown vintage instead of guessing it", () => {
    expect(compareAskingToValuation({ ...base, kind: null, year: null })).toMatchObject({ status: "available", vintageKnown: false });
  });

  it("is unavailable with a reason for missing inputs and poor-fit property types", () => {
    expect(compareAskingToValuation({ ...base, askingPrice: null })).toEqual({ status: "unavailable", reason: "missing_asking_price" });
    expect(compareAskingToValuation({ ...base, ejendomsvaerdi: 0 })).toEqual({ status: "unavailable", reason: "missing_ejendomsvaerdi" });
    expect(compareAskingToValuation({ ...base, propertyType: "lejlighed" })).toEqual({ status: "unavailable", reason: "poor_property_fit" });
  });
});

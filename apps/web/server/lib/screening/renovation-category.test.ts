import { describe, expect, it } from "vitest";
import { classifyRenovationCategory } from "./renovation-category.js";

describe("classifyRenovationCategory", () => {
  it("returns a real (non-estimate) category when a tilstandsrapport category is supplied", () => {
    const result = classifyRenovationCategory({ yearBuilt: 1950, renovationYear: null, reportedCategory: "C" });
    expect(result).toEqual({
      category: "C",
      isEstimate: false,
      symbol: "⚠️",
      reason: "Renovation category C from tilstandsrapport",
      source: "ai",
    });
  });

  it("estimates category A for a recently renovated building", () => {
    const currentYear = new Date().getFullYear();
    const result = classifyRenovationCategory({ yearBuilt: 1900, renovationYear: currentYear - 5 });
    expect(result.category).toBe("A");
    expect(result.isEstimate).toBe(true);
    expect(result.symbol).toBe("~");
  });

  it("estimates category D for an old, never-renovated building", () => {
    const result = classifyRenovationCategory({ yearBuilt: 1900, renovationYear: null });
    expect(result.category).toBe("D");
    expect(result.isEstimate).toBe(true);
  });

  it("defaults to the most conservative category when no year is available", () => {
    const result = classifyRenovationCategory({ yearBuilt: null, renovationYear: null });
    expect(result.category).toBe("D");
    expect(result.symbol).toBe("~");
    expect(result.reason).toMatch(/no build or renovation year/i);
  });
});

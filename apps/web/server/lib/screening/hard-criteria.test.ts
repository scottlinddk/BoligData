import { describe, expect, it } from "vitest";
import {
  checkArea,
  checkEncumbranceRatio,
  checkMonthlyCost,
  checkPriceCeiling,
  checkRooms,
  checkTakeoverDate,
} from "./hard-criteria.js";
import type { FinancingAssumptions } from "./config/financing-assumptions.js";
import { DEFAULT_FINANCING_ASSUMPTIONS } from "./config/financing-assumptions.js";

const assumptions: FinancingAssumptions = DEFAULT_FINANCING_ASSUMPTIONS;

describe("checkPriceCeiling", () => {
  it("passes with a plain checkmark when under the ceiling and the category is confirmed", () => {
    const result = checkPriceCeiling(2_000_000, "A", false, assumptions);
    expect(result).toMatchObject({ key: "priceCeiling", passed: true, symbol: "✅", source: "ai" });
  });

  it("downgrades a pass to a warning when the renovation category is only an estimate", () => {
    const result = checkPriceCeiling(2_000_000, "A", true, assumptions);
    expect(result.passed).toBe(true);
    expect(result.symbol).toBe("⚠️");
  });

  it("fails above the ceiling regardless of estimate status", () => {
    const result = checkPriceCeiling(50_000_000, "A", false, assumptions);
    expect(result).toMatchObject({ passed: false, symbol: "❌" });
  });
});

describe("checkMonthlyCost", () => {
  it("fails when asking price is far beyond what the down payment + rate can support", () => {
    const result = checkMonthlyCost(50_000_000, "C", assumptions);
    expect(result).toMatchObject({ key: "monthlyCost", passed: false, symbol: "❌", source: "ai" });
  });

  it("passes for a low asking price close to the down payment", () => {
    const result = checkMonthlyCost(1_000_000, "A", assumptions);
    expect(result.passed).toBe(true);
    expect(result.symbol).toBe("✅");
  });
});

describe("checkArea", () => {
  it("returns ~ when area data is unavailable", () => {
    expect(checkArea(null, assumptions)).toMatchObject({ passed: false, symbol: "~" });
  });

  it("passes at or above the minimum", () => {
    expect(checkArea(assumptions.minAreaSqm, assumptions)).toMatchObject({ passed: true, symbol: "✅" });
  });

  it("fails below the minimum", () => {
    expect(checkArea(assumptions.minAreaSqm - 1, assumptions)).toMatchObject({ passed: false, symbol: "❌" });
  });
});

describe("checkRooms", () => {
  it("returns ~ when room count is unavailable", () => {
    expect(checkRooms(null, "B", assumptions)).toMatchObject({ passed: false, symbol: "~" });
  });

  it("passes at or above the minimum for the given definition", () => {
    const result = checkRooms(assumptions.minRoomsByDefinition.B, "B", assumptions);
    expect(result.passed).toBe(true);
  });

  it("uses a different threshold per room-count definition", () => {
    const roomCount = assumptions.minRoomsByDefinition.A;
    const resultA = checkRooms(roomCount, "A", assumptions);
    const resultC = checkRooms(roomCount, "C", assumptions);
    expect(resultA.passed).toBe(true);
    expect(resultC.passed).toBe(false);
  });
});

describe("checkTakeoverDate", () => {
  it("returns ~ when no seller date is provided", () => {
    expect(checkTakeoverDate(null, assumptions)).toMatchObject({ passed: false, symbol: "~" });
  });

  it("returns ~ when no deadline is configured", () => {
    const noDeadline: FinancingAssumptions = { ...assumptions, latestAcceptableTakeoverDate: null };
    expect(checkTakeoverDate("2026-09-01", noDeadline)).toMatchObject({ passed: false, symbol: "~" });
  });

  it("passes when the seller date is on or before the deadline", () => {
    const configured: FinancingAssumptions = { ...assumptions, latestAcceptableTakeoverDate: "2026-12-01" };
    expect(checkTakeoverDate("2026-11-01", configured)).toMatchObject({ passed: true, symbol: "✅" });
  });

  it("fails when the seller date is after the deadline", () => {
    const configured: FinancingAssumptions = { ...assumptions, latestAcceptableTakeoverDate: "2026-12-01" };
    expect(checkTakeoverDate("2027-01-01", configured)).toMatchObject({ passed: false, symbol: "❌" });
  });
});

describe("checkEncumbranceRatio", () => {
  it("returns ~ when encumbrances are unavailable", () => {
    expect(checkEncumbranceRatio(null, 2_000_000, assumptions)).toMatchObject({ passed: false, symbol: "~" });
  });

  it("passes under the ratio ceiling", () => {
    const result = checkEncumbranceRatio(10_000, 2_000_000, assumptions);
    expect(result.passed).toBe(true);
  });

  it("fails over the ratio ceiling", () => {
    const result = checkEncumbranceRatio(500_000, 2_000_000, assumptions);
    expect(result.passed).toBe(false);
  });
});

import type {
  PropertyLookupInput,
  RenovationCategoryResult,
  ScreeningCriterionResult,
} from "../../../../../packages/shared/src/types/property-lookup.js";
import {
  checkArea,
  checkEncumbranceRatio,
  checkMonthlyCost,
  checkPriceCeiling,
  checkRooms,
  checkTakeoverDate,
  noAskingPriceResult,
} from "./hard-criteria.js";
import { DEFAULT_FINANCING_ASSUMPTIONS, type FinancingAssumptions } from "./config/financing-assumptions.js";

export interface SymbolEngineInput {
  input: PropertyLookupInput;
  areaSqm: number | null;
  roomCount: number | null;
  energyLabel: string | null;
  renovationCategory: RenovationCategoryResult;
  assumptions?: FinancingAssumptions;
}

/**
 * Runs all six hard criteria and returns them as one ordered ScreeningCriterionResult[], every entry tagged source: "ai".
 * Without an asking price the three price-based criteria are reported as unavailable; the rest still run.
 */
export function evaluateScreening(params: SymbolEngineInput): ScreeningCriterionResult[] {
  const { input, areaSqm, roomCount, energyLabel, renovationCategory } = params;
  const assumptions = params.assumptions ?? DEFAULT_FINANCING_ASSUMPTIONS;
  const askingPrice = input.askingPrice ?? null;

  return [
    askingPrice === null
      ? noAskingPriceResult("priceCeiling")
      : checkPriceCeiling(askingPrice, renovationCategory.category, renovationCategory.isEstimate, assumptions),
    askingPrice === null ? noAskingPriceResult("monthlyCost") : checkMonthlyCost(askingPrice, energyLabel, assumptions),
    checkArea(areaSqm, assumptions),
    checkRooms(roomCount, input.roomCountDefinition ?? "B", assumptions),
    checkTakeoverDate(input.sellerTakeoverDate ?? null, assumptions),
    askingPrice === null
      ? noAskingPriceResult("encumbranceRatio")
      : checkEncumbranceRatio(input.totalEncumbrancesDkk ?? null, askingPrice, assumptions),
  ];
}

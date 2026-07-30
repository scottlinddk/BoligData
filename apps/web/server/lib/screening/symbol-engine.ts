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

/** Runs all six hard criteria and returns them as one ordered ScreeningCriterionResult[], every entry tagged source: "ai". */
export function evaluateScreening(params: SymbolEngineInput): ScreeningCriterionResult[] {
  const { input, areaSqm, roomCount, energyLabel, renovationCategory } = params;
  const assumptions = params.assumptions ?? DEFAULT_FINANCING_ASSUMPTIONS;

  return [
    checkPriceCeiling(input.askingPrice, renovationCategory.category, renovationCategory.isEstimate, assumptions),
    checkMonthlyCost(input.askingPrice, energyLabel, assumptions),
    checkArea(areaSqm, assumptions),
    checkRooms(roomCount, input.roomCountDefinition ?? "B", assumptions),
    checkTakeoverDate(input.sellerTakeoverDate ?? null, assumptions),
    checkEncumbranceRatio(input.totalEncumbrancesDkk ?? null, input.askingPrice, assumptions),
  ];
}

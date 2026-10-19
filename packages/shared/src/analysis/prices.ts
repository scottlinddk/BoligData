import type { ResearchPriceInput, ResearchPriceMetrics } from "./types.js";

const price = (value: number | null): value is number => value !== null && Number.isFinite(value) && value > 0;

/** Signed percentage points; a sale above asking deliberately returns a negative discount. */
export function researchPriceFall(from: number | null, to: number | null): number | null {
  return price(from) && price(to) ? ((from - to) / from) * 100 : null;
}

export function calculatePriceMetrics(input: ResearchPriceInput): ResearchPriceMetrics {
  const additionalDiscountPercent = researchPriceFall(input.currentAsking, input.targetPrice);
  return {
    alreadyReducedPercent: researchPriceFall(input.firstAsking, input.currentAsking),
    additionalDiscountAmount: price(input.currentAsking) && price(input.targetPrice) ? input.currentAsking - input.targetPrice : null,
    additionalDiscountPercent,
    totalRequiredFallPercent: researchPriceFall(input.firstAsking, input.targetPrice),
    historicalTotalFallPercent: researchPriceFall(input.firstAsking, input.soldPrice),
    historicalLastDiscountPercent: researchPriceFall(input.lastAsking, input.soldPrice),
    noDiscountRequired: additionalDiscountPercent !== null && additionalDiscountPercent <= 0,
  };
}

/** A budget-based asking ceiling in the chosen scenario, never an estimate of fair market value. */
export function scenarioAskingCeiling(maxPurchasePrice: number | null, totalFallPercent: number | null): number | null {
  if (!price(maxPurchasePrice) || totalFallPercent === null || !Number.isFinite(totalFallPercent) || totalFallPercent >= 100) return null;
  return maxPurchasePrice / (1 - totalFallPercent / 100);
}

/** Apply total-fall references only to a documented FIRST asking price, never today's asking by default. */
export function historicalReferencePrice(firstAsking: number | null, totalFallPercent: number | null): number | null {
  if (!price(firstAsking) || totalFallPercent === null || !Number.isFinite(totalFallPercent) || totalFallPercent >= 100) return null;
  return firstAsking * (1 - totalFallPercent / 100);
}

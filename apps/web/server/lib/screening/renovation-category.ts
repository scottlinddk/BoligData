import type { RenovationCategory, RenovationCategoryResult } from "../../../../../packages/shared/src/types/property-lookup.js";

export interface RenovationCategoryInput {
  yearBuilt: number | null;
  renovationYear: number | null;
  /**
   * A real category read off a tilstandsrapport, when the caller already has
   * one — this endpoint never parses tilstandsrapport/elinstallationsrapport
   * PDFs itself (explicit non-goal), so this is the only way `isEstimate`
   * comes back false.
   */
  reportedCategory?: RenovationCategory | null;
}

function categorySymbol(category: RenovationCategory): RenovationCategoryResult["symbol"] {
  return category === "A" || category === "B" ? "✅" : category === "C" ? "⚠️" : "❌";
}

/**
 * Classifies renovation category A (best) to D (worst). Without a real
 * tilstandsrapport, this is a building-age heuristic and always comes back
 * `isEstimate: true` with the `~` symbol — an estimate, not a substitute for
 * reading the actual report.
 */
export function classifyRenovationCategory(input: RenovationCategoryInput): RenovationCategoryResult {
  if (input.reportedCategory) {
    return {
      category: input.reportedCategory,
      isEstimate: false,
      symbol: categorySymbol(input.reportedCategory),
      reason: `Renovation category ${input.reportedCategory} from tilstandsrapport`,
      source: "ai",
    };
  }

  const referenceYear = input.renovationYear ?? input.yearBuilt;
  if (referenceYear === null) {
    return {
      category: "D",
      isEstimate: true,
      symbol: "~",
      reason: "No build or renovation year available — defaulting to the most conservative renovation category",
      source: "ai",
    };
  }

  const age = new Date().getFullYear() - referenceYear;
  const category: RenovationCategory = age <= 10 ? "A" : age <= 25 ? "B" : age <= 45 ? "C" : "D";
  const basis = input.renovationYear !== null ? "renovation" : "construction";

  return {
    category,
    isEstimate: true,
    symbol: "~",
    reason: `Estimated from building age (${age}y since ${basis} in ${referenceYear}); no tilstandsrapport data`,
    source: "ai",
  };
}

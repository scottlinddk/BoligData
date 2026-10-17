import type { Property } from "@shared/types/index";
import type { SparListingEstimate } from "@shared/types/spar";
import { daysBetween, pricePerSqm } from "@shared/utils/price";

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 3;

/** Parses the `ids` query value: trimmed, unique, in order, capped at the maximum. Null when fewer than two remain. */
export function parseCompareIds(raw: string | null): string[] | null {
  const ids = [...new Set((raw ?? "").split(",").map(id => id.trim()).filter(Boolean))].slice(0, COMPARE_MAX);
  return ids.length >= COMPARE_MIN ? ids : null;
}

/** Toggle with a cap. `full` tells the caller that an add was refused so it can explain why. */
export function toggleCompareId(current: string[], id: string): { ids: string[]; full: boolean } {
  if (current.includes(id)) return { ids: current.filter(existing => existing !== id), full: false };
  if (current.length >= COMPARE_MAX) return { ids: current, full: true };
  return { ids: [...current, id], full: false };
}

export interface CompareValues {
  price: number;
  /** Null for listings that are off the market, so a stale price is not presented as current. */
  daysOnMarket: number | null;
  pricePerSqm: number | null;
  sqm: number | null;
  rooms: number | null;
  buildingYear: number | null;
  energyLabel: string | null;
  propertyType: string;
  listingSource: string;
  valuation: { valueDkk: number; year: number } | null;
  fair: { estimate: number; lo80: number; hi80: number } | null;
  /** asking / estimate - 1. Null without both. */
  askingVsFair: number | null;
}

const positive = (value: number | null | undefined): value is number => value != null && Number.isFinite(value) && value > 0;

/** Plain values for one column of the comparison. Nothing is ranked or judged here. */
export function compareValues(property: Property, spar: SparListingEstimate | null | undefined, now?: string): CompareValues {
  const available = spar?.status === "available" ? spar : null;
  return {
    price: property.price,
    daysOnMarket: property.status === "active" && property.listingDate ? daysBetween(property.listingDate, now) : null,
    pricePerSqm: positive(property.sqm) && positive(property.price) ? pricePerSqm(property.price, property.sqm) : null,
    sqm: positive(property.sqm) ? property.sqm : null,
    rooms: positive(property.rooms) ? property.rooms : null,
    buildingYear: positive(property.buildingYear) ? property.buildingYear : null,
    energyLabel: property.bbrData?.energyLabel ?? null,
    propertyType: property.propertyType,
    listingSource: property.listingSource,
    valuation: available?.valuation ? { valueDkk: available.valuation.valueDkk, year: available.valuation.year } : null,
    fair: available?.fairPrice ? { estimate: available.fairPrice.estimate, lo80: available.fairPrice.lo80, hi80: available.fairPrice.hi80 } : null,
    askingVsFair: available?.askingVsFair ?? null,
  };
}

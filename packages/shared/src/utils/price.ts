export function pricePerSqm(price: number, sqm: number): number {
  if (sqm <= 0) return 0;
  return Math.round(price / sqm);
}

export function formatDkk(amount: number): string {
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function daysBetween(fromIso: string, toIso: string = new Date().toISOString()): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.max(0, Math.round((to - from) / (1000 * 60 * 60 * 24)));
}

/**
 * Rough gross rental yield estimate. Callers pass an assumed annual rent;
 * this is a placeholder calculation until real rental data is available.
 */
export function estimateYield(annualRent: number, price: number): number | null {
  if (price <= 0) return null;
  return Math.round((annualRent / price) * 1000) / 10;
}

export function priceTrendPercent(current: number, neighborhoodAvg: number): number | null {
  if (neighborhoodAvg <= 0) return null;
  return Math.round(((current - neighborhoodAvg) / neighborhoodAvg) * 1000) / 10;
}

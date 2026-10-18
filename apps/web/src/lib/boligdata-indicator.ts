/**
 * The BoligData indicator price: an equal-weighted average of independent price methods.
 *
 * The smart estimate and the SPAR fair price are the same number (public valuation x SPAR level), so they
 * enter as ONE source. Averaging them separately would silently weight SPAR twice. Sources that cannot
 * be computed for a home are left out, and fewer than two sources gives no indicator, since an "average"
 * of one number is just that number under a different name.
 */

export type IndicatorSourceKey = "spar" | "timeOnMarket";

export interface IndicatorSource {
  key: IndicatorSourceKey;
  priceDkk: number;
}

export interface BoligDataIndicator {
  priceDkk: number;
  sources: IndicatorSource[];
  /** Lowest and highest source, so a wide disagreement between methods is visible. */
  lowDkk: number;
  highDkk: number;
  /** Spread between the methods relative to the indicator. High means the methods disagree. */
  spreadRatio: number;
  /** Asking price relative to the indicator, or null without a valid asking price. */
  askingVsIndicator: number | null;
}

/** Above this spread the methods disagree enough that the average hides more than it tells. */
export const INDICATOR_DISAGREEMENT_RATIO = 0.15;
/** Same rounding as the time-on-market reference (its coarsest input), so the headline is not more precise than its inputs. */
const ROUNDING_DKK = 10_000;

const usable = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

export function boligdataIndicator(input: { sparPriceDkk?: number | null; timeOnMarketPriceDkk?: number | null; askingPriceDkk?: number | null }): BoligDataIndicator | null {
  const sources: IndicatorSource[] = [];
  if (usable(input.sparPriceDkk)) sources.push({ key: "spar", priceDkk: input.sparPriceDkk });
  if (usable(input.timeOnMarketPriceDkk)) sources.push({ key: "timeOnMarket", priceDkk: input.timeOnMarketPriceDkk });
  if (sources.length < 2) return null;
  const prices = sources.map(source => source.priceDkk);
  const priceDkk = Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length / ROUNDING_DKK) * ROUNDING_DKK;
  const lowDkk = Math.min(...prices), highDkk = Math.max(...prices);
  return {
    priceDkk, sources, lowDkk, highDkk,
    spreadRatio: (highDkk - lowDkk) / priceDkk,
    askingVsIndicator: usable(input.askingPriceDkk) ? input.askingPriceDkk / priceDkk - 1 : null,
  };
}

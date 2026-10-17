import type { SupabaseClient } from "@supabase/supabase-js";
import { selectValuation, type SparValuation } from "../../../../../packages/shared/src/analysis/spar.js";
import type { PropertyLookupResult } from "../../../../../packages/shared/src/types/property-lookup.js";
import type { SparListingEstimate } from "../../../../../packages/shared/src/types/spar.js";
import { loadSegment } from "../spar.handler.js";
import { estimateFromValuation, noValuationEstimate, unsupportedEstimate } from "../spar-estimate.js";

/**
 * The valuations of an address looked up by id, in the shape SPAR selects from. They are the parcel's own
 * (`SFE`), which is why only houses get here: an apartment would need its own ejerlejlighed BFE.
 *
 * A valuation the register gave no registration date for is treated as known today. That is the same
 * "known by" rule the stored valuations use for a live estimate (`observed_at`), and it would not be safe
 * for a backtest, which this is not.
 */
export function sparValuationsFromLookup(lookup: PropertyLookupResult, asOf: string): SparValuation[] {
  const bfe = lookup.resolved.bfeNummer;
  if (bfe === null) return [];
  return lookup.valuationHistory.flatMap((entry) =>
    entry.propertyValueDkk === null || entry.propertyValueDkk <= 0
      ? []
      : [{ bfe, bfeType: "SFE" as const, valuationYear: entry.year, value: entry.propertyValueDkk, registeredAt: entry.registeredAt ?? asOf }],
  );
}

/**
 * Fair price and market level for an address that is not a listing: its public valuation times the same
 * market level listings use. There is no asking price, so nothing is compared against one.
 *
 * Throws when the market level cannot be loaded; the caller decides that this must not fail the lookup.
 */
export async function estimateAddressSpar(
  client: SupabaseClient,
  lookup: PropertyLookupResult,
  asOf: string = new Date().toISOString().slice(0, 10),
): Promise<SparListingEstimate> {
  if (lookup.propertyClass === "other") return unsupportedEstimate(asOf);

  const own = selectValuation(sparValuationsFromLookup(lookup, asOf), { asOf, isUnit: false });
  // Without a valuation there is nothing to re-price, so the market level is not worth loading.
  if (!own) return noValuationEstimate(asOf);

  const segment = await loadSegment(client, false, asOf);
  return estimateFromValuation(segment, own, null);
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PropertyLookupResult, ValuationYearEntry } from "../../../../../packages/shared/src/types/property-lookup.js";
import { estimateAddressSpar, sparValuationsFromLookup } from "./address-spar.js";
import { buildSparSegment, estimateForListing, type SparSaleRow, type SparValuationRow } from "../spar-estimate.js";
import { loadSegment } from "../spar.handler.js";

vi.mock("../spar.handler.js", () => ({ loadSegment: vi.fn() }));

const AS_OF = "2025-10-01";
const client = {} as SupabaseClient;

/** A market of 40 houses valued 2,000,000 that sell at about 1.1 times that, built by the production index code. */
function market() {
  const valuations: SparValuationRow[] = [];
  const sales: SparSaleRow[] = [];
  for (let i = 0; i < 40; i++) {
    valuations.push({ propertyId: `p${i}`, bfe: `bfe-${i}`, bfeType: "SFE", valuationYear: 2024, value: 2_000_000, registeredAt: "2025-01-01T00:00:00Z" });
    sales.push({
      id: `s${i}`, propertyId: `p${i}`, soldDate: `2025-${String(1 + (i % 9)).padStart(2, "0")}-15`,
      price: Math.round(2_000_000 * 1.1 * (1 + ((i % 5) - 2) * 0.01)), saleType: "normal",
    });
  }
  return buildSparSegment({ asOf: AS_OF, isUnit: false, valuations, sales });
}

const year = (y: number, value: number | null, registeredAt: string | null = "2025-03-01T00:00:00.000Z"): ValuationYearEntry =>
  ({ year: y, propertyValueDkk: value, landValueDkk: 500_000, registeredAt });

function lookup(overrides: Partial<PropertyLookupResult> = {}): PropertyLookupResult {
  return {
    resolved: { bfeNummer: "5000001" },
    valuationHistory: [year(2022, 1_800_000), year(2024, 3_000_000)],
    propertyClass: "house",
    ...overrides,
  } as unknown as PropertyLookupResult;
}

beforeEach(() => {
  vi.mocked(loadSegment).mockReset();
  vi.mocked(loadSegment).mockResolvedValue(market());
});

describe("sparValuationsFromLookup", () => {
  it("turns valuation years into parcel (SFE) valuations of the resolved BFE", () => {
    expect(sparValuationsFromLookup(lookup(), AS_OF)).toEqual([
      { bfe: "5000001", bfeType: "SFE", valuationYear: 2022, value: 1_800_000, registeredAt: "2025-03-01T00:00:00.000Z" },
      { bfe: "5000001", bfeType: "SFE", valuationYear: 2024, value: 3_000_000, registeredAt: "2025-03-01T00:00:00.000Z" },
    ]);
  });

  it("treats a valuation with no registration date as known today", () => {
    expect(sparValuationsFromLookup(lookup({ valuationHistory: [year(2024, 3_000_000, null)] }), AS_OF)[0]?.registeredAt).toBe(AS_OF);
  });

  it("skips years without a usable value and everything when no BFE was resolved", () => {
    expect(sparValuationsFromLookup(lookup({ valuationHistory: [year(2024, null), year(2022, 0)] }), AS_OF)).toEqual([]);
    expect(sparValuationsFromLookup(lookup({ resolved: { bfeNummer: null } as PropertyLookupResult["resolved"] }), AS_OF)).toEqual([]);
  });
});

describe("estimateAddressSpar", () => {
  it("prices the latest valuation at the market level, the same way a listing is priced", async () => {
    const result = await estimateAddressSpar(client, lookup({ valuationHistory: [year(2024, 2_000_000)] }), AS_OF);

    expect(result.status).toBe("available");
    expect(result.valuation).toEqual({ valueDkk: 2_000_000, year: 2024, bfe: "5000001" });
    expect(result.index!.ratio).toBeGreaterThan(1.05);
    expect(result.index!.ratio).toBeLessThan(1.15);
    expect(result.fairPrice!.estimate).toBeCloseTo(2_000_000 * result.index!.ratio, 0);

    // Identical to what a stored listing with this valuation gets.
    const sameAsListing = estimateForListing(market(), { propertyId: "p0", askingPrice: null });
    expect(result.fairPrice).toEqual(sameAsListing.fairPrice);
    expect(result.history).toEqual(sameAsListing.history);
  });

  it("has no asking price, so it compares nothing against one", async () => {
    const result = await estimateAddressSpar(client, lookup({ valuationHistory: [year(2024, 2_000_000)] }), AS_OF);
    expect(result.askingPrice).toBeNull();
    expect(result.askingVsFair).toBeNull();
  });

  it("uses the newest valuation year", async () => {
    const result = await estimateAddressSpar(client, lookup({ valuationHistory: [year(2022, 1_000_000), year(2024, 2_000_000)] }), AS_OF);
    expect(result.valuation?.year).toBe(2024);
  });

  it("will not mix a valuation year with a market built on another year", async () => {
    const result = await estimateAddressSpar(client, lookup({ valuationHistory: [year(2022, 1_800_000)] }), AS_OF);
    expect(result).toMatchObject({ status: "no_valuation", reason: "valuation_vintage_mismatch", fairPrice: null });
  });

  it("explains an apartment building or other use instead of pricing it, without loading the market", async () => {
    const result = await estimateAddressSpar(client, lookup({ propertyClass: "other" }), AS_OF);
    expect(result).toMatchObject({ status: "no_valuation", reason: "unsupported_property_type", fairPrice: null, valuation: null });
    expect(loadSegment).not.toHaveBeenCalled();
  });

  it("reports no valuation, without loading the market, when there is nothing to re-price", async () => {
    const result = await estimateAddressSpar(client, lookup({ valuationHistory: [] }), AS_OF);
    expect(result).toMatchObject({ status: "no_valuation", reason: "no_valuation_for_property", fairPrice: null });
    expect(loadSegment).not.toHaveBeenCalled();
  });

  it("reports too few sales when the market is too thin, rather than a number", async () => {
    vi.mocked(loadSegment).mockResolvedValue(buildSparSegment({ asOf: AS_OF, isUnit: false, valuations: [], sales: [] }));
    const result = await estimateAddressSpar(client, lookup({ valuationHistory: [year(2024, 2_000_000)] }), AS_OF);
    expect(result.status).not.toBe("available");
    expect(result.fairPrice).toBeNull();
  });

  it("loads the house market, not the apartment one", async () => {
    await estimateAddressSpar(client, lookup({ valuationHistory: [year(2024, 2_000_000)] }), AS_OF);
    expect(loadSegment).toHaveBeenCalledWith(client, false, AS_OF);
  });

  it("lets a market-loading failure reach the caller, which must not fail the lookup over it", async () => {
    vi.mocked(loadSegment).mockRejectedValue(new Error("database unavailable"));
    await expect(estimateAddressSpar(client, lookup({ valuationHistory: [year(2024, 2_000_000)] }), AS_OF)).rejects.toThrow("database unavailable");
  });
});

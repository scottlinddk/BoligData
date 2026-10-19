import type { BbrData, Property, PublicValuation, SoldPriceEntry, ZoneStatus } from "@shared/types/index";
import type { PropertyDetailResponse } from "@shared/types/api";
import type { NearbySaleEntry, PropertyLookupDataMode, PropertyLookupResult } from "@shared/types/property-lookup";

type Enrichment = PropertyDetailResponse["enrichment"];

/**
 * Where a value on the detail page came from.
 * - `register` — this request's live `/api/property-lookup` read.
 * - `stored` — a cached real-source response with explicit group provenance.
 *   Legacy rows without provenance and fabricated values are not facts.
 */
export type FactSource = "register" | "stored";

export interface MergedPropertyFacts {
  bbrData: BbrData | null;
  bbrSource: FactSource | null;
  publicValuation: PublicValuation | null;
  valuationSource: FactSource | null;
  zone: ZoneStatus | null;
  matrikelnr: string | null;
  ejerlav: string | null;
  bfeNummer: string | null;
  buildingYear: number | null;
  renovationYear: number | null;
  /**
   * BBR's own floor area, but only when it disagrees with the listing's. A
   * listing that advertises more square metres than the register records is a
   * due-diligence signal, so the two are shown side by side rather than one
   * quietly replacing the other. Null when they agree or BBR has no area.
   */
  registerAreaSqm: number | null;
  /** Registered sales of this address, newest first. */
  priceHistory: SoldPriceEntry[];
  priceHistorySource: FactSource | null;
  /** Recent registered sales around this address ("salg i nærheden"), nearest first. */
  nearbySales: NearbySaleEntry[];
}

/** True when the lookup produced a value for at least one BBR field. */
function hasAnyValue(bbr: BbrData | null): boolean {
  return bbr !== null && Object.values(bbr).some((v) => v !== null);
}

/**
 * Register-first merge of everything the detail page renders.
 *
 * A coherent source group wins. Missing live fields stay unknown rather than
 * promoting cached values under a live-source badge. Source availability is
 * checked per group; a live address lookup cannot validate a mock BBR result.
 * Listing prices are never re-derived using a different area definition.
 */
export function mergePropertyFacts(
  property: Property,
  enrichment: Enrichment,
  lookup: PropertyLookupResult | null,
): MergedPropertyFacts {
  const lookupIsLive = (key: PropertyLookupResult["sources"][number]["key"]) =>
    lookup?.sources.some((source) => source.key === key && source.mode === "live") === true;
  const storedIsReal = (key: string) => enrichment?.sourceStatus?.[key]?.dataMode === "real";
  const stored = storedIsReal("bbr") ? enrichment?.bbrData ?? null : null;
  const live = lookupIsLive("bbr") && lookup?.bbrData ? { ...lookup.bbrData, energyLabel: null } : null;
  const liveIsUsable = hasAnyValue(live);
  // The lookup's energy label is caller-supplied, not a register observation.
  const bbrData = liveIsUsable ? { ...live!, energyLabel: null } : hasAnyValue(stored) ? stored : null;
  const liveValuation = lookupIsLive("publicValuation") ? lookup?.publicValuation ?? null : null;
  const storedValuation = storedIsReal("valuation") ? enrichment?.publicValuation ?? null : null;
  const valuationIsLive = liveValuation !== null && Object.values(liveValuation).some((value) => value !== null);

  const registerArea = live?.areaSqm ?? null;

  // Boligsiden embeds an address's registered sales in the same case record
  // the crawl already reads, so the stored row carries a history too. The live
  // read still wins: the stored one is only as fresh as the last crawl of this
  // listing, and `listingContentHash` doesn't change when a *neighbour*
  // transacts — or when this address does, if nothing else about the listing
  // moved.
  const livePriceHistory = lookupIsLive("sales") ? lookup?.priceHistory ?? [] : [];
  const storedPriceHistory = storedIsReal("sales") ? enrichment?.soldPriceHistory ?? [] : [];
  const priceHistory = livePriceHistory.length > 0 ? livePriceHistory : storedPriceHistory;

  return {
    bbrData,
    bbrSource: bbrData === null ? null : liveIsUsable ? "register" : "stored",
    publicValuation: valuationIsLive ? liveValuation : storedValuation,
    valuationSource: valuationIsLive ? "register" : storedValuation !== null ? "stored" : null,
    // Unprovenanced cached cadastral fields cannot become live register facts.
    zone: lookupIsLive("address") ? lookup?.resolved.zone ?? null : null,
    matrikelnr: lookupIsLive("address") ? lookup?.resolved.matrikelnr ?? null : null,
    ejerlav: lookupIsLive("address") ? lookup?.resolved.ejerlav ?? null : null,
    bfeNummer: lookupIsLive("address") ? lookup?.resolved.bfeNummer ?? null : null,
    buildingYear: bbrData?.yearBuilt ?? (property.dataMode === "real" ? property.buildingYear : null) ?? null,
    renovationYear: bbrData?.renovationYear ?? null,
    registerAreaSqm: registerArea !== null && registerArea !== property.sqm ? registerArea : null,
    priceHistory,
    priceHistorySource:
      priceHistory.length === 0 ? null : livePriceHistory.length > 0 ? "register" : "stored",
    nearbySales: lookupIsLive("sales") ? lookup?.nearbySales ?? [] : [],
  };
}

export interface SourceSummaryEntry {
  key: PropertyLookupResult["sources"][number]["key"];
  mode: PropertyLookupDataMode;
  error: string | null;
}

/**
 * Flattens the lookup's per-register provenance for display. Kept as a
 * function rather than read inline so the "no lookup at all" case (request
 * still in flight, or failed) has one obvious representation: an empty list.
 */
export function summarizeLookupSources(lookup: PropertyLookupResult | null): SourceSummaryEntry[] {
  if (lookup === null) return [];
  return lookup.sources.map((s) => ({ key: s.key, mode: s.mode, error: s.error }));
}

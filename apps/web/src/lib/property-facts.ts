import type { BbrData, Property, PublicValuation, ZoneStatus } from "@shared/types/index";
import type { PropertyDetailResponse } from "@shared/types/api";
import type { PropertyLookupDataMode, PropertyLookupResult } from "@shared/types/property-lookup";

type Enrichment = PropertyDetailResponse["enrichment"];

/**
 * Where a value on the detail page came from.
 * - `register` — this request's live `/api/property-lookup` read.
 * - `stored` — the property's `enrichments` row, written by the nightly
 *   crawl. Rows ingested before the sources went live still hold mock values,
 *   which is exactly why the two are labelled differently in the UI.
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
}

/** True when the lookup produced a value for at least one BBR field. */
function hasAnyValue(bbr: BbrData | null): boolean {
  return bbr !== null && Object.values(bbr).some((v) => v !== null);
}

/**
 * Register-first merge of everything the detail page renders.
 *
 * The live lookup wins field by field rather than object by object: BBR can
 * answer `yearBuilt` while `basementSqm` stays null (it lives on a different
 * entity), and dropping the stored value in that case would lose data the
 * page used to show. Price and price/m² are deliberately *not* touched — they
 * are the listing's own numbers, and re-deriving them from a register area
 * would silently change what the rest of the page means.
 */
export function mergePropertyFacts(
  property: Property,
  enrichment: Enrichment,
  lookup: PropertyLookupResult | null,
): MergedPropertyFacts {
  const stored = enrichment?.bbrData ?? null;
  const live = lookup?.bbrData ?? null;
  const liveIsUsable = hasAnyValue(live);

  const bbrData: BbrData | null =
    live === null && stored === null
      ? null
      : {
          yearBuilt: live?.yearBuilt ?? stored?.yearBuilt ?? null,
          renovationYear: live?.renovationYear ?? stored?.renovationYear ?? null,
          // The lookup only echoes back the energy label its caller supplied,
          // so it is never a better source for this field than the stored row.
          energyLabel: stored?.energyLabel ?? live?.energyLabel ?? null,
          areaSqm: live?.areaSqm ?? stored?.areaSqm ?? null,
          buildingType: live?.buildingType ?? stored?.buildingType ?? null,
          heatingInstallation: live?.heatingInstallation ?? stored?.heatingInstallation ?? null,
          floors: live?.floors ?? stored?.floors ?? null,
          roofMaterial: live?.roofMaterial ?? stored?.roofMaterial ?? null,
          wallMaterial: live?.wallMaterial ?? stored?.wallMaterial ?? null,
          basementSqm: live?.basementSqm ?? stored?.basementSqm ?? null,
          toiletCount: live?.toiletCount ?? stored?.toiletCount ?? null,
          bathroomCount: live?.bathroomCount ?? stored?.bathroomCount ?? null,
        };

  const liveValuation = lookup?.publicValuation ?? null;
  const storedValuation = enrichment?.publicValuation ?? null;
  const valuationIsLive = liveValuation !== null && liveValuation.assessedPropertyValueDkk !== null;

  const registerArea = live?.areaSqm ?? null;

  return {
    bbrData,
    bbrSource: bbrData === null ? null : liveIsUsable ? "register" : "stored",
    publicValuation: valuationIsLive ? liveValuation : storedValuation,
    valuationSource: valuationIsLive ? "register" : storedValuation !== null ? "stored" : null,
    // The address register retired its zone field, so `zone` comes back null
    // from the lookup for every address today; the stored column still holds
    // whatever the earlier ingest resolved.
    zone: lookup?.resolved.zone ?? property.zone ?? null,
    matrikelnr: lookup?.resolved.matrikelnr ?? property.matrikelnr ?? null,
    ejerlav: lookup?.resolved.ejerlav ?? property.ejerlav ?? null,
    bfeNummer: lookup?.resolved.bfeNummer ?? null,
    buildingYear: live?.yearBuilt ?? property.buildingYear ?? stored?.yearBuilt ?? null,
    renovationYear: live?.renovationYear ?? stored?.renovationYear ?? null,
    registerAreaSqm: registerArea !== null && registerArea !== property.sqm ? registerArea : null,
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

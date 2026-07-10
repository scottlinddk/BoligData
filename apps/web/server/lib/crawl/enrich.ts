import type {
  BbrData,
  CalculatedMetrics,
  EnrichmentSource,
  RiskFlags,
  SchoolTransportInfo,
  SoldPriceEntry,
} from "../../../../../packages/shared/src/types/index.js";
import type { RawListing } from "./types.js";

// Deliberately independent of CRAWL_MOCK_MODE: flipping the *fetchers* live
// must not drag enrichment into the not-implemented branch below, or a live
// crawl trial crashes after upserting. Mock enrichment is currently the only
// implementation; set ENRICH_MOCK_MODE=false only once real clients exist.
const MOCK_MODE = process.env.ENRICH_MOCK_MODE !== "false";

export interface EnrichmentPayload {
  bbr_data: BbrData;
  sold_price_history: SoldPriceEntry[];
  calculated_metrics: CalculatedMetrics;
  risk_flags: RiskFlags;
  school_transport: SchoolTransportInfo | null;
  source: EnrichmentSource;
  enriched_at: string;
}

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Enriches a raw listing with BBR/OIS/risk-flag data. Real Datafordeler
 * (BBR/DAR), OIS, and Vejdirektoratet API clients are not implemented yet —
 * this deterministically derives plausible-looking mock data from the
 * listing's external_id so results are stable across repeated crawls.
 * Flip ENRICH_MOCK_MODE=false once real clients land behind this interface.
 */
export async function enrichProperty(listing: RawListing): Promise<EnrichmentPayload> {
  if (!MOCK_MODE) {
    throw new Error(
      "Real BBR/OIS/Vejdirektoratet enrichment is not implemented yet. Unset ENRICH_MOCK_MODE or implement enrichProperty().",
    );
  }

  const seed = hashSeed(listing.external_id);
  const pricePerSqm = Math.round(listing.price / listing.sqm);

  return {
    bbr_data: {
      yearBuilt: listing.building_year,
      renovationYear: seed % 3 === 0 ? (listing.building_year ?? 1970) + 20 : null,
      energyLabel: ["A", "B", "C", "D", "E"][seed % 5] ?? null,
      areaSqm: listing.sqm,
      buildingType: listing.property_type,
    },
    sold_price_history: [],
    calculated_metrics: {
      pricePerSqm,
      neighborhoodPricePerSqm: pricePerSqm,
      priceTrendPercent: null,
      estimatedYieldPercent: null,
      daysOnMarket: 0,
    },
    risk_flags: {
      noiseExposureLden: 40 + (seed % 25),
      encumbranceCheckRequired: seed % 2 === 0,
      sewerSeparationRequired: seed % 4 === 0,
      oilTankRisk: (listing.building_year ?? 2000) < 1970,
      soilContaminationRisk: seed % 7 === 0,
    },
    school_transport: null,
    source: "mock",
    enriched_at: new Date().toISOString(),
  };
}

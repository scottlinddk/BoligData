import type {
  BbrData,
  CalculatedMetrics,
  EnrichmentSource,
  OilTankRiskSource,
  RiskFlags,
  SchoolTransportInfo,
  SoilContaminationClassification,
  SoldPriceEntry,
} from "../../../../../packages/shared/src/types/index.js";
import type { AddressCadastral } from "../enrichment-sources/address-lookup.js";
import { lookupBbr } from "../enrichment-sources/bbr.js";
import { lookupSoilType } from "../enrichment-sources/geus-jordart.js";
import { lookupSoilContamination } from "../enrichment-sources/miljoeportalen-v1v2.js";
import { buildTinglysningUrl } from "../enrichment-sources/tinglysning-link.js";
import { hashSeed } from "../enrichment-sources/types.js";
import type { RawListing } from "./types.js";

// Deliberately independent of CRAWL_MOCK_MODE: flipping the *fetchers* live
// must not drag enrichment into a not-implemented branch, or a live crawl
// trial crashes after upserting. Each real source below has its own
// MOCK_MODE flag too, so this only gates whether enrichProperty *attempts*
// real lookups at all.
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

/**
 * Støjbelastning (noise) and kloakseparering (sewer separation) have no
 * integrated data source: Danish traffic noise mapping (Miljøstyrelsens
 * støjkort) and per-municipality spildevandsplan data are both out of scope
 * for now — see README "Data ingest status". These two fields stay on the
 * deterministic mock derivation indefinitely, in both mock and real mode.
 */
function deferredMockFlags(seed: number): Pick<RiskFlags, "noiseExposureLden" | "sewerSeparationRequired"> {
  return {
    noiseExposureLden: 40 + (seed % 25),
    sewerSeparationRequired: seed % 4 === 0,
  };
}

function mockSoilClassification(seed: number): SoilContaminationClassification {
  return seed % 7 === 0 ? "v2" : "none";
}

/**
 * Enriches a raw listing with BBR/soil-contamination/risk-flag data.
 * `cadastral` (from address-lookup.ts, Fase 1) supplies matrikelnr/ejerlav
 * for the tinglysning.dk deep-link and id_lokalid for the BBR lookup — null
 * when the cadastral lookup hasn't run or failed for this property.
 */
export async function enrichProperty(
  listing: RawListing,
  cadastral: AddressCadastral | null = null,
): Promise<EnrichmentPayload> {
  const seed = hashSeed(listing.external_id);
  const pricePerSqm = Math.round(listing.price / listing.sqm);
  const encumbranceLookupUrl = buildTinglysningUrl(cadastral?.matrikelnr ?? null, cadastral?.ejerlav ?? null);
  const oilTankHeuristic = (listing.building_year ?? 2000) < 1970;

  let soilClassification: SoilContaminationClassification;
  let jordart: string | null;
  let heatingInstallation: string | null = null;
  let oilTankRisk: boolean;
  let oilTankRiskSource: OilTankRiskSource;
  let source: EnrichmentSource;

  if (MOCK_MODE) {
    soilClassification = mockSoilClassification(seed);
    jordart = null;
    oilTankRisk = oilTankHeuristic;
    oilTankRiskSource = "heuristic";
    source = "mock";
  } else {
    // Each source is independently gated and failure-isolated: one lookup
    // erroring must not blank out the others, mirroring ingest.ts's
    // Promise.allSettled treatment of crawl sources.
    const [soilTypeResult, contaminationResult, bbrResult] = await Promise.allSettled([
      lookupSoilType(listing.lat, listing.lon),
      lookupSoilContamination(listing.lat, listing.lon),
      lookupBbr(cadastral?.idLokalid ?? null),
    ]);

    jordart =
      soilTypeResult.status === "fulfilled" && soilTypeResult.value.ok ? soilTypeResult.value.data.jordart : null;
    soilClassification =
      contaminationResult.status === "fulfilled" && contaminationResult.value.ok
        ? contaminationResult.value.data.classification
        : "unknown";

    const bbrData = bbrResult.status === "fulfilled" && bbrResult.value.ok ? bbrResult.value.data : null;
    const bbrOk = bbrData !== null;
    heatingInstallation = bbrData?.heatingInstallation ?? null;

    if (bbrOk && heatingInstallation !== null) {
      oilTankRisk = heatingInstallation === "oliefyr";
      oilTankRiskSource = "bbr";
      source = "datafordeler";
    } else {
      oilTankRisk = oilTankHeuristic;
      oilTankRiskSource = "heuristic";
      source = "mock";
    }
  }

  return {
    bbr_data: {
      yearBuilt: listing.building_year,
      renovationYear: seed % 3 === 0 ? (listing.building_year ?? 1970) + 20 : null,
      energyLabel: ["A", "B", "C", "D", "E"][seed % 5] ?? null,
      areaSqm: listing.sqm,
      buildingType: listing.property_type,
      heatingInstallation,
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
      ...deferredMockFlags(seed),
      encumbranceCheckRequired: true,
      encumbranceLookupUrl,
      oilTankRisk,
      oilTankRiskSource,
      soilContamination: { classification: soilClassification, jordart },
    },
    school_transport: null,
    source,
    enriched_at: new Date().toISOString(),
  };
}

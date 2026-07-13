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
import { lookupBbr, type BbrBuildingData } from "../enrichment-sources/bbr.js";
import { lookupSoilType } from "../enrichment-sources/geus-jordart.js";
import { lookupSoilContamination } from "../enrichment-sources/miljoeportalen-v1v2.js";
import { buildSpildevandsplanUrl } from "../enrichment-sources/spildevandsplan.js";
import { lookupNoiseExposure, mockNoiseExposure } from "../enrichment-sources/stoejkort.js";
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
  const sewerSeparationLookupUrl = buildSpildevandsplanUrl(listing.municipality);
  const oilTankHeuristic = (listing.building_year ?? 2000) < 1970;

  let soilClassification: SoilContaminationClassification;
  let jordart: string | null;
  let bbrBuilding: BbrBuildingData | null = null;
  let oilTankRisk: boolean;
  let oilTankRiskSource: OilTankRiskSource;
  let noiseExposureLden: number | null;
  let source: EnrichmentSource;

  if (MOCK_MODE) {
    soilClassification = mockSoilClassification(seed);
    jordart = null;
    oilTankRisk = oilTankHeuristic;
    oilTankRiskSource = "heuristic";
    noiseExposureLden = mockNoiseExposure(listing.lat, listing.lon);
    source = "mock";
  } else {
    // Each source is independently gated and failure-isolated: one lookup
    // erroring must not blank out the others, mirroring ingest.ts's
    // Promise.allSettled treatment of crawl sources.
    const [soilTypeResult, contaminationResult, bbrResult, noiseResult] = await Promise.allSettled([
      lookupSoilType(listing.lat, listing.lon),
      lookupSoilContamination(listing.lat, listing.lon),
      lookupBbr(cadastral?.idLokalid ?? null),
      lookupNoiseExposure(listing.lat, listing.lon),
    ]);

    jordart =
      soilTypeResult.status === "fulfilled" && soilTypeResult.value.ok ? soilTypeResult.value.data.jordart : null;
    soilClassification =
      contaminationResult.status === "fulfilled" && contaminationResult.value.ok
        ? contaminationResult.value.data.classification
        : "unknown";
    noiseExposureLden =
      noiseResult.status === "fulfilled" && noiseResult.value.ok ? noiseResult.value.data.ldenDb : null;

    bbrBuilding = bbrResult.status === "fulfilled" && bbrResult.value.ok ? bbrResult.value.data : null;
    const heatingInstallation = bbrBuilding?.heatingInstallation ?? null;

    if (bbrBuilding !== null && heatingInstallation !== null) {
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
      yearBuilt: bbrBuilding?.yearBuilt ?? listing.building_year,
      renovationYear: bbrBuilding?.renovationYear ?? (seed % 3 === 0 ? (listing.building_year ?? 1970) + 20 : null),
      energyLabel: ["A", "B", "C", "D", "E"][seed % 5] ?? null,
      areaSqm: bbrBuilding?.areaSqm ?? listing.sqm,
      buildingType: bbrBuilding?.buildingType ?? listing.property_type,
      floors: bbrBuilding?.floors ?? null,
      roofMaterial: bbrBuilding?.roofMaterial ?? null,
      wallMaterial: bbrBuilding?.wallMaterial ?? null,
      heatingInstallation: bbrBuilding?.heatingInstallation ?? null,
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
      noiseExposureLden,
      encumbranceCheckRequired: true,
      encumbranceLookupUrl,
      sewerSeparationCheckRequired: true,
      sewerSeparationLookupUrl,
      oilTankRisk,
      oilTankRiskSource,
      soilContamination: { classification: soilClassification, jordart },
    },
    school_transport: null,
    source,
    enriched_at: new Date().toISOString(),
  };
}

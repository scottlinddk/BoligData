import type {
  BbrData, CalculatedMetrics, EnrichmentSource, PublicValuation, RiskFlags,
  SchoolTransportInfo, SoldPriceEntry,
} from "../../../../../packages/shared/src/types/index.js";
import type { AddressCadastral } from "../enrichment-sources/address-lookup.js";
import { lookupBbr } from "../enrichment-sources/bbr.js";
import { lookupEjendomsvurdering } from "../enrichment-sources/ejendomsvurdering.js";
import { lookupSoilType } from "../enrichment-sources/geus-jordart.js";
import { lookupSoilContamination } from "../enrichment-sources/miljoeportalen-v1v2.js";
import { buildJordforureningsattestUrl } from "../enrichment-sources/jordforureningsattest-link.js";
import { buildSpildevandsplanUrl } from "../enrichment-sources/spildevandsplan.js";
import { lookupNoiseExposure } from "../enrichment-sources/stoejkort.js";
import { buildTinglysningUrl } from "../enrichment-sources/tinglysning-link.js";
import { mockModeEnabled, type SourceResult } from "../enrichment-sources/types.js";
import type { RawListing } from "./types.js";

export interface RegisterSourceStatus {
  dataMode: "real" | "mock" | "unavailable";
  observedAt: string;
  method: "register_lookup";
  verificationStatus: "unverified" | "unavailable";
  reason: string | null;
}

export interface EnrichmentPayload {
  bbr_data: BbrData;
  sold_price_history: SoldPriceEntry[];
  calculated_metrics: CalculatedMetrics;
  risk_flags: RiskFlags;
  school_transport: SchoolTransportInfo | null;
  public_valuation: PublicValuation | null;
  source: EnrichmentSource;
  source_status: Record<string, RegisterSourceStatus>;
  enriched_at: string;
}

/** Each register keeps its own provenance. Synthetic register values never
 * populate the property read model, even when another register is live. */
export async function enrichProperty(
  listing: RawListing,
  cadastral: AddressCadastral | null = null,
): Promise<EnrichmentPayload> {
  const observedAt = new Date().toISOString();
  const sourceStatus: Record<string, RegisterSourceStatus> = {
    sales: {
      dataMode: listing.data_mode === "real" ? "real" : listing.data_mode === "mock" || listing.data_mode === "demo" ? "mock" : "unavailable",
      observedAt, method: "register_lookup", verificationStatus: listing.data_mode === "real" ? "unverified" : "unavailable",
      reason: listing.data_mode === "real" ? null : "Listing registration provenance is not live",
    },
  };
  const mockRun = process.env.ENRICH_MOCK_MODE !== "false" || listing.data_mode === "mock" || listing.data_mode === "demo";

  async function read<T>(key: string, isMock: boolean, lookup: () => Promise<SourceResult<T>>): Promise<T | null> {
    if (mockRun || isMock) {
      sourceStatus[key] = { dataMode: "mock", observedAt, method: "register_lookup", verificationStatus: "unavailable", reason: "Demo/mock source: omitted from property facts" };
      return null;
    }
    try {
      const result = await lookup();
      sourceStatus[key] = {
        dataMode: result.ok ? "real" : "unavailable", observedAt, method: "register_lookup",
        verificationStatus: result.ok ? "unverified" : "unavailable", reason: result.ok ? null : result.error,
      };
      return result.ok ? result.data : null;
    } catch (error) {
      sourceStatus[key] = { dataMode: "unavailable", observedAt, method: "register_lookup", verificationStatus: "unavailable", reason: error instanceof Error ? error.message : String(error) };
      return null;
    }
  }

  const [bbr, valuation, soil, contamination, noise] = await Promise.all([
    read("bbr", mockModeEnabled("BBR_MOCK_MODE"), () => lookupBbr(cadastral?.idLokalid ?? null)),
    read("valuation", mockModeEnabled("EJENDOMSVURDERING_MOCK_MODE"), () => lookupEjendomsvurdering(cadastral?.matrikelnr ?? null, cadastral?.ejerlav ?? null, cadastral?.bfeNummer ?? null)),
    read("soil_type", process.env.GEUS_MOCK_MODE !== "false", () => lookupSoilType(listing.lat, listing.lon)),
    read("soil_contamination", process.env.MILJOEPORTALEN_MOCK_MODE !== "false", () => lookupSoilContamination(listing.lat, listing.lon)),
    read("noise", mockModeEnabled("STOEJKORT_MOCK_MODE"), () => lookupNoiseExposure(listing.lat, listing.lon)),
  ]);
  const heatingKnown = bbr?.heatingInstallation != null;
  return {
    bbr_data: {
      yearBuilt: bbr?.yearBuilt ?? null,
      renovationYear: bbr?.renovationYear ?? null,
      energyLabel: null, // No implemented source supplies an energy certificate.
      areaSqm: bbr?.areaSqm ?? null,
      buildingType: bbr?.buildingType ?? null,
      floors: bbr?.floors ?? null,
      roofMaterial: bbr?.roofMaterial ?? null,
      wallMaterial: bbr?.wallMaterial ?? null,
      heatingInstallation: bbr?.heatingInstallation ?? null,
      basementSqm: bbr?.basementSqm ?? null,
      toiletCount: bbr?.toiletCount ?? null,
      bathroomCount: bbr?.bathroomCount ?? null,
    },
    // Keep historic registrations independent of the current asking price;
    // invalid/future observations are separately retained for review.
    sold_price_history: (listing.sold_price_history ?? []).filter((sale) => sale.soldDate <= observedAt.slice(0, 10)),
    calculated_metrics: {
      pricePerSqm: Math.round(listing.price / listing.sqm),
      neighborhoodPricePerSqm: null,
      priceTrendPercent: null,
      estimatedYieldPercent: null,
      daysOnMarket: null,
    },
    risk_flags: {
      noiseExposureLden: noise?.ldenDb ?? null,
      encumbranceCheckRequired: true,
      encumbranceLookupUrl: buildTinglysningUrl(cadastral?.matrikelnr ?? null, cadastral?.ejerlav ?? null),
      sewerSeparationCheckRequired: true,
      sewerSeparationLookupUrl: buildSpildevandsplanUrl(listing.municipality),
      oilTankRisk: heatingKnown ? bbr!.heatingInstallation === "oliefyr" : (listing.building_year ?? 2000) < 1970,
      oilTankRiskSource: heatingKnown ? "bbr" : "heuristic",
      soilContamination: { classification: contamination?.classification ?? "unknown", jordart: soil?.jordart ?? null },
      soilContaminationAttestUrl: buildJordforureningsattestUrl(cadastral?.ejerlavskode ?? null, cadastral?.matrikelnr ?? null),
    },
    school_transport: null,
    public_valuation: valuation,
    source: bbr || valuation ? "datafordeler" : "mock",
    source_status: sourceStatus,
    enriched_at: observedAt,
  };
}

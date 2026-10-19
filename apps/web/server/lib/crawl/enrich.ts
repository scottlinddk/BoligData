import type {
  BbrData, CalculatedMetrics, EnrichmentSource, PublicValuation, RiskFlags,
  SchoolTransportInfo, SoldPriceEntry,
} from "../../../../../packages/shared/src/types/index.js";
import type { AddressCadastral } from "../enrichment-sources/address-lookup.js";
import { lookupBbr } from "../enrichment-sources/bbr.js";
import { lookupBbrTanks } from "../enrichment-sources/bbr-tanks.js";
import { lookupEjendomsvurdering } from "../enrichment-sources/ejendomsvurdering.js";
import { lookupLand } from "../enrichment-sources/matrikel.js";
import { lookupSoilType } from "../enrichment-sources/geus-jordart.js";
import { lookupSoilContamination } from "../enrichment-sources/miljoeportalen-v1v2.js";
import { buildJordforureningsattestUrl } from "../enrichment-sources/jordforureningsattest-link.js";
import { lookupNoiseExposure } from "../enrichment-sources/stoejkort.js";
import { buildRiskFlags } from "../due-diligence/risk-flags.js";
import { municipalityNameFromCode } from "../municipalities.js";
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
  const mockRun = mockModeEnabled("ENRICH_MOCK_MODE") || listing.data_mode === "mock" || listing.data_mode === "demo";

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

  const husnummerId = cadastral?.idLokalid ?? null;
  const [bbr, valuation, soil, contamination, noise, land, tanks] = await Promise.all([
    read("bbr", mockModeEnabled("BBR_MOCK_MODE"), () => lookupBbr(husnummerId)),
    read("valuation", mockModeEnabled("EJENDOMSVURDERING_MOCK_MODE"), () => lookupEjendomsvurdering({
      husnummerId, bfeNummer: cadastral?.bfeNummer ?? null, matrikelnr: cadastral?.matrikelnr ?? null, ejerlav: cadastral?.ejerlav ?? null,
    })),
    read("soil_type", mockModeEnabled("GEUS_MOCK_MODE"), () => lookupSoilType(listing.lat, listing.lon)),
    read("soil_contamination", mockModeEnabled("MILJOEPORTALEN_MOCK_MODE"), () => lookupSoilContamination(listing.lat, listing.lon)),
    read("noise", mockModeEnabled("STOEJKORT_MOCK_MODE"), () => lookupNoiseExposure(listing.lat, listing.lon)),
    // Recorded in source_status for transparency but not in enrichment-refresh's register list: an apartment
    // never has land or a parcel valuation of its own, and a source that can never answer would re-enrich every crawl.
    read("land", mockModeEnabled("MATRIKEL_MOCK_MODE"), () => lookupLand({
      husnummerId, bfeNummer: cadastral?.bfeNummer ?? null, matrikelnr: cadastral?.matrikelnr ?? null, ejerlavskode: cadastral?.ejerlavskode ?? null,
    })),
    read("oil_tanks", mockModeEnabled("BBR_MOCK_MODE"), () => lookupBbrTanks(husnummerId)),
  ]);
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
    risk_flags: buildRiskFlags({
      // The address register's municipality code when it answered, else the listing's own municipality name.
      municipality: municipalityNameFromCode(cadastral?.municipalityCode ?? null) ?? listing.municipality,
      heating: bbr?.heatingInstallation ?? null,
      noise,
      soil: contamination,
      tanks,
      land,
      valuation,
      jordart: soil?.jordart ?? null,
      parcelAttestUrl: buildJordforureningsattestUrl(cadastral?.ejerlavskode ?? null, cadastral?.matrikelnr ?? null),
      // BBR not settling the heating leaves the listing's long-standing building-year heuristic, labelled as such.
      oilTankFallback: { oilTankRisk: (listing.building_year ?? 2000) < 1970, oilTankRiskSource: "heuristic" },
    }),
    school_transport: null,
    public_valuation: valuation
      ? { assessedPropertyValueDkk: valuation.assessedPropertyValueDkk, assessedLandValueDkk: valuation.assessedLandValueDkk, valuationYear: valuation.valuationYear }
      : null,
    source: bbr || valuation ? "datafordeler" : "mock",
    source_status: sourceStatus,
    enriched_at: observedAt,
  };
}

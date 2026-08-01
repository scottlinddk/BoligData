import type {
  PropertyLookupDataMode,
  PropertyLookupInput,
  PropertyLookupResult,
  PropertyLookupSourceStatus,
} from "../../../../../packages/shared/src/types/property-lookup.js";
import { lookupAddressCadastral } from "../enrichment-sources/address-lookup.js";
import { lookupBbr } from "../enrichment-sources/bbr.js";
import { lookupEjendomsvurdering } from "../enrichment-sources/ejendomsvurdering.js";
import { lookupNoiseExposure } from "../enrichment-sources/stoejkort.js";
import { mockModeEnabled, type SourceResult } from "../enrichment-sources/types.js";
import { isDanishCoordinate } from "../crawl/map-utils.js";
import { DEFAULT_FINANCING_ASSUMPTIONS, type FinancingAssumptions } from "../screening/config/financing-assumptions.js";
import { classifyRenovationCategory } from "../screening/renovation-category.js";
import { evaluateScreening } from "../screening/symbol-engine.js";
import { extractScoringInputs } from "../scoring/relative-score-inputs.js";

/** Maps a source's outcome onto the provenance entry that ships in the response. */
function status(
  key: PropertyLookupSourceStatus["key"],
  register: string,
  mockFlag: string,
  result: SourceResult<unknown>,
): PropertyLookupSourceStatus {
  if (!result.ok) return { key, register, mode: "unavailable", error: result.error };
  return { key, register, mode: mockModeEnabled(mockFlag) ? "mock" : "live", error: null };
}

const MODE_SEVERITY: Record<PropertyLookupDataMode, number> = { live: 0, mock: 1, unavailable: 2 };

function worstMode(statuses: PropertyLookupSourceStatus[]): PropertyLookupDataMode {
  return statuses.reduce<PropertyLookupDataMode>(
    (worst, s) => (MODE_SEVERITY[s.mode] > MODE_SEVERITY[worst] ? s.mode : worst),
    "live",
  );
}

/**
 * Orchestrates the property-lookup pipeline: address register (free-text
 * address -> DAR husnummer UUID, cadastral parcel, BFE, zone, coordinates) ->
 * BBR + VUR + noise -> screening (hard criteria) -> scoring inputs.
 *
 * Two ordering facts matter here. First, the address lookup is the only step
 * that needs no credential, so it runs first and everything downstream keys
 * off what it resolved. Second, it is also the geocoder: a caller that passes
 * only an address gets the register's own access-point coordinates, and those
 * — not the `0,0` this used to fall back to — are what the noise lookup is
 * given.
 *
 * Every value in the returned payload is tagged `source: "ai"`; this endpoint
 * never asserts `source: "verified"`, since verifying (encumbrances,
 * servitutter, tilstandsrapport) stays a human decision. Which register each
 * group of values actually came from — and why any of them are null — is
 * reported separately in `sources`.
 */
export async function lookupProperty(
  input: PropertyLookupInput,
  assumptions: FinancingAssumptions = DEFAULT_FINANCING_ASSUMPTIONS,
): Promise<PropertyLookupResult> {
  const cadastralResult = await lookupAddressCadastral(
    input.address,
    input.postalCode ?? null,
    input.lat ?? 0,
    input.lon ?? 0,
  );
  const cadastral = cadastralResult.ok ? cadastralResult.data : null;

  const lat = cadastral?.lat ?? input.lat ?? null;
  const lon = cadastral?.lon ?? input.lon ?? null;
  const hasCoordinates = lat !== null && lon !== null && isDanishCoordinate(lat, lon);

  const [bbrResult, valuationResult, noiseResult] = await Promise.all([
    lookupBbr(cadastral?.idLokalid ?? null),
    lookupEjendomsvurdering(
      cadastral?.matrikelnr ?? null,
      cadastral?.ejerlav ?? null,
      cadastral?.bfeNummer ?? null,
    ),
    // Querying a noise WFS at 0,0 returns a confident-looking "no noise here"
    // for a point in the Atlantic, so an unresolvable address skips the call
    // rather than answering it wrongly.
    hasCoordinates ? lookupNoiseExposure(lat, lon) : null,
  ]);

  const bbrBuilding = bbrResult.ok ? bbrResult.data : null;
  const publicValuation = valuationResult.ok ? valuationResult.data : null;
  const noiseExposureLden = noiseResult?.ok ? noiseResult.data.ldenDb : null;

  const sources: PropertyLookupSourceStatus[] = [
    status("address", "DAR via DAWA (api.dataforsyningen.dk)", "ADDRESS_LOOKUP_MOCK_MODE", cadastralResult),
    status("bbr", "BBR via Datafordeler GraphQL", "BBR_MOCK_MODE", bbrResult),
    status("publicValuation", "VUR via Datafordeler GraphQL", "EJENDOMSVURDERING_MOCK_MODE", valuationResult),
    noiseResult === null
      ? {
          key: "noise" as const,
          register: "Miljøstyrelsens støjkort (WFS)",
          mode: "unavailable" as const,
          error: "no usable coordinates for the address",
        }
      : status("noise", "Miljøstyrelsens støjkort (WFS)", "STOEJKORT_MOCK_MODE", noiseResult),
  ];

  const renovationCategory = classifyRenovationCategory({
    yearBuilt: bbrBuilding?.yearBuilt ?? null,
    renovationYear: bbrBuilding?.renovationYear ?? null,
  });

  const areaSqm = bbrBuilding?.areaSqm ?? null;
  const energyLabel = input.energyLabel ?? null;

  const screening = evaluateScreening({
    input,
    areaSqm,
    roomCount: input.roomCount ?? null,
    energyLabel,
    renovationCategory,
    assumptions,
  });

  const scoringInputs = extractScoringInputs({
    input,
    areaSqm,
    renovationCategory,
    noiseExposureLden,
    assumptions,
  });

  return {
    address: input.address,
    resolved: {
      idLokalid: cadastral?.idLokalid ?? null,
      matrikelnr: cadastral?.matrikelnr ?? null,
      ejerlav: cadastral?.ejerlav ?? null,
      ejerlavskode: cadastral?.ejerlavskode ?? null,
      bfeNummer: cadastral?.bfeNummer ?? null,
      zone: cadastral?.zone ?? null,
      formattedAddress: cadastral?.formattedAddress ?? null,
      postalCode: cadastral?.postalCode ?? input.postalCode ?? null,
      lat: hasCoordinates ? lat : null,
      lon: hasCoordinates ? lon : null,
    },
    bbrData: bbrBuilding
      ? {
          yearBuilt: bbrBuilding.yearBuilt,
          renovationYear: bbrBuilding.renovationYear,
          energyLabel,
          areaSqm: bbrBuilding.areaSqm,
          buildingType: bbrBuilding.buildingType,
          heatingInstallation: bbrBuilding.heatingInstallation,
          floors: bbrBuilding.floors,
          roofMaterial: bbrBuilding.roofMaterial,
          wallMaterial: bbrBuilding.wallMaterial,
          basementSqm: bbrBuilding.basementSqm,
          toiletCount: bbrBuilding.toiletCount,
          bathroomCount: bbrBuilding.bathroomCount,
        }
      : null,
    publicValuation: publicValuation
      ? {
          assessedPropertyValueDkk: publicValuation.assessedPropertyValueDkk,
          assessedLandValueDkk: publicValuation.assessedLandValueDkk,
          valuationYear: publicValuation.valuationYear,
        }
      : null,
    renovationCategory,
    screening,
    scoringInputs,
    sources,
    dataMode: worstMode(sources),
    source: "ai",
  };
}

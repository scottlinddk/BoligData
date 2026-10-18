import type { PublicValuation } from "../../../../../packages/shared/src/types/index.js";
import type {
  PropertyLookupDataMode,
  PropertyLookupInput,
  PropertyLookupResult,
  PropertyLookupSourceStatus,
  ValuationYearEntry,
} from "../../../../../packages/shared/src/types/property-lookup.js";
import { lookupAddressCadastral } from "../enrichment-sources/address-lookup.js";
import { lookupHusnummerById } from "../enrichment-sources/adressevaelger.js";
import { lookupBbr } from "../enrichment-sources/bbr.js";
import { lookupEjendomsvurdering } from "../enrichment-sources/ejendomsvurdering.js";
import { lookupHouseValuation } from "../enrichment-sources/vur-valuations.js";
import { buildAddressRiskFlags } from "./address-risk-flags.js";
import { lookupNoiseExposure } from "../enrichment-sources/stoejkort.js";
import { lookupSoilContamination } from "../enrichment-sources/miljoeportalen-v1v2.js";
import { lookupBoligsidenSales } from "../enrichment-sources/boligsiden-sales.js";
import { mockModeEnabled, type SourceResult } from "../enrichment-sources/types.js";
import { isDanishCoordinate } from "../crawl/map-utils.js";
import { DEFAULT_FINANCING_ASSUMPTIONS, type FinancingAssumptions } from "../screening/config/financing-assumptions.js";
import { classifyRenovationCategory } from "../screening/renovation-category.js";
import { evaluateScreening } from "../screening/symbol-engine.js";
import { extractScoringInputs } from "../scoring/relative-score-inputs.js";

/**
 * Maps a source's outcome onto the provenance entry that ships in the response.
 * `mockFlag` is null for a source that has no mock mode and is therefore never mock.
 */
function status(
  key: PropertyLookupSourceStatus["key"],
  register: string,
  mockFlag: string | null,
  result: SourceResult<unknown>,
): PropertyLookupSourceStatus {
  if (!result.ok) return { key, register, mode: "unavailable", error: result.error };
  return { key, register, mode: mockFlag !== null && mockModeEnabled(mockFlag) ? "mock" : "live", error: null };
}

const NOISE_REGISTER = "Miljøstyrelsens støjkortlægning (WFS, wfs2-miljoegis.mim.dk)";
const SOIL_REGISTER = "Danmarks Miljøportal, jordforurening V1/V2 (WFS, jord.miljoeportal.dk)";

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
  // An id the user picked in the Adressevælger autocomplete is resolved
  // directly. It is not a free-text guess, and it is the only path that still
  // works now that DAWA (the free-text resolver) is closed.
  const addressMockFlag = input.husnummerId ? null : "ADDRESS_LOOKUP_MOCK_MODE";
  const cadastralResult = input.husnummerId
    ? await lookupHusnummerById(input.husnummerId)
    : await lookupAddressCadastral(input.address, input.postalCode ?? null, input.lat ?? 0, input.lon ?? 0);
  // A successful mock lookup is still synthetic: its identifiers and
  // coordinates must not seed subsequent live register requests.
  const cadastral =
    cadastralResult.ok && (addressMockFlag === null || !mockModeEnabled(addressMockFlag)) ? cadastralResult.data : null;

  const lat = cadastral?.lat ?? input.lat ?? null;
  const lon = cadastral?.lon ?? input.lon ?? null;
  const hasCoordinates = lat !== null && lon !== null && isDanishCoordinate(lat, lon);

  // A listing's valuation is looked up by the parcel the address register returned. An address picked by id has
  // no parcel, so its valuation is found from the husnummer itself (houses only; see vur-valuations.ts).
  const byId = Boolean(input.husnummerId);
  // Boligsiden's sale history is only attributed to an address that is identified, never by coordinates alone. For
  // an id lookup the register's own street, number and postcode identify it (see `recordIsAddress`).
  const subjectAddress =
    byId && cadastral?.streetName && cadastral.houseNumber && cadastral.postalCode
      ? { road: cadastral.streetName, houseNumber: cadastral.houseNumber, zipCode: cadastral.postalCode }
      : undefined;

  const [bbrResult, listingValuationResult, houseLookup, noiseResult, salesResult, soilResult] = await Promise.all([
    lookupBbr(cadastral?.idLokalid ?? null),
    byId
      ? null
      : lookupEjendomsvurdering(cadastral?.matrikelnr ?? null, cadastral?.ejerlav ?? null, cadastral?.bfeNummer ?? null),
    byId ? lookupHouseValuation(cadastral?.idLokalid ?? null) : null,
    // Querying a noise WFS at 0,0 returns a confident-looking "no noise here"
    // for a point in the Atlantic, so an unresolvable address skips the call
    // rather than answering it wrongly.
    hasCoordinates ? lookupNoiseExposure(lat, lon) : null,
    // Same reasoning: a polygon around 0,0 is a box in the Atlantic, and an
    // empty "no sales nearby" is indistinguishable from a real answer.
    hasCoordinates ? lookupBoligsidenSales(lat, lon, subjectAddress ? { subjectAddress } : {}) : null,
    hasCoordinates ? lookupSoilContamination(lat, lon) : null,
  ]);

  const bbrBuilding = bbrResult.ok && !mockModeEnabled("BBR_MOCK_MODE") ? bbrResult.data : null;

  // For an id lookup the valuation chain has no mock mode: it reads the register or reports why it could not.
  const valuationMockFlag = byId ? null : "EJENDOMSVURDERING_MOCK_MODE";
  const valuationResult: SourceResult<unknown> = houseLookup ? houseLookup.valuation : listingValuationResult!;
  const valuationHistory: ValuationYearEntry[] = houseLookup?.valuation.ok ? houseLookup.valuation.data : [];
  const latestYear = [...valuationHistory].reverse().find((entry) => entry.propertyValueDkk !== null) ?? null;
  const publicValuation: PublicValuation | null = byId
    ? latestYear
      ? { assessedPropertyValueDkk: latestYear.propertyValueDkk, assessedLandValueDkk: latestYear.landValueDkk, valuationYear: latestYear.year }
      : null
    : listingValuationResult?.ok && !mockModeEnabled("EJENDOMSVURDERING_MOCK_MODE")
      ? listingValuationResult.data
      : null;
  const noise = noiseResult?.ok && !mockModeEnabled("STOEJKORT_MOCK_MODE") ? noiseResult.data : null;
  const noiseExposureLden = noise?.ldenDb ?? null;
  const soil = soilResult?.ok && !mockModeEnabled("MILJOEPORTALEN_MOCK_MODE") ? soilResult.data : null;
  const sales = salesResult?.ok && !mockModeEnabled("BOLIGSIDEN_SALES_MOCK_MODE") ? salesResult.data : null;

  const addressRegisterLabel = input.husnummerId
    ? "DAR via Adressevælger (adressevaelger.dk)"
    : cadastral?.resolvedVia === "dar_fallback"
      ? "DAR via Datafordeler GraphQL (DAWA fallback)"
      : cadastral?.resolvedVia === "adressevaelger"
        ? "DAR via Adressevælger (adressevaelger.dk)"
        : "DAR via DAWA (api.dataforsyningen.dk)";

  const sources: PropertyLookupSourceStatus[] = [
    status("address", addressRegisterLabel, addressMockFlag, cadastralResult),
    status("bbr", "BBR via Datafordeler GraphQL", "BBR_MOCK_MODE", bbrResult),
    status("publicValuation", "VUR via Datafordeler GraphQL", valuationMockFlag, valuationResult),
    noiseResult === null
      ? {
          key: "noise" as const,
          register: NOISE_REGISTER,
          mode: "unavailable" as const,
          error: "no usable coordinates for the address",
        }
      : status("noise", NOISE_REGISTER, "STOEJKORT_MOCK_MODE", noiseResult),
    salesResult === null
      ? {
          key: "sales" as const,
          register: "Boligsiden (registrerede handler)",
          mode: "unavailable" as const,
          error: "no usable coordinates for the address",
        }
      : status("sales", "Boligsiden (registrerede handler)", "BOLIGSIDEN_SALES_MOCK_MODE", salesResult),
    soilResult === null
      ? { key: "soil" as const, register: SOIL_REGISTER, mode: "unavailable" as const, error: "no usable coordinates for the address" }
      : status("soil", SOIL_REGISTER, "MILJOEPORTALEN_MOCK_MODE", soilResult),
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
    address: input.address || cadastral?.formattedAddress || "",
    resolved: {
      idLokalid: cadastral?.idLokalid ?? null,
      matrikelnr: cadastral?.matrikelnr ?? null,
      ejerlav: cadastral?.ejerlav ?? null,
      ejerlavskode: cadastral?.ejerlavskode ?? null,
      bfeNummer: cadastral?.bfeNummer ?? houseLookup?.bfeNummer ?? null,
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
          // Caller-supplied labels remain screening inputs, not BBR facts.
          energyLabel: null,
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
    valuationHistory,
    propertyClass: houseLookup?.propertyClass ?? null,
    // Null only when the address itself could not be resolved: then there is nothing to check against.
    riskFlags: cadastral
      ? buildAddressRiskFlags({ municipalityCode: cadastral.municipalityCode ?? null, bbr: bbrBuilding, noise, soil })
      : null,
    publicValuation: publicValuation
      ? {
          assessedPropertyValueDkk: publicValuation.assessedPropertyValueDkk,
          assessedLandValueDkk: publicValuation.assessedLandValueDkk,
          valuationYear: publicValuation.valuationYear,
        }
      : null,
    priceHistory: sales?.priceHistory ?? [],
    priceHistoryMatch: sales?.historyMatch ?? null,
    nearbySales: sales?.nearbySales ?? [],
    renovationCategory,
    screening,
    scoringInputs,
    sources,
    dataMode: worstMode(sources),
    source: "ai",
  };
}

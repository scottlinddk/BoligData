import type { PublicValuation, SoldPriceEntry } from "../../../../../packages/shared/src/types/index.js";
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
import { lookupBbrTanks } from "../enrichment-sources/bbr-tanks.js";
import { lookupBbrAtDate } from "../enrichment-sources/bbr-at-date.js";
import { lookupRegisteredSales } from "../enrichment-sources/ejf-sales.js";
import { lookupEjendomsvurdering, valuationFromYears } from "../enrichment-sources/ejendomsvurdering.js";
import { lookupLand } from "../enrichment-sources/matrikel.js";
import { lookupHouseValuation } from "../enrichment-sources/vur-valuations.js";
import { buildAddressRiskFlags } from "./address-risk-flags.js";
import { lookupNoiseExposure } from "../enrichment-sources/stoejkort.js";
import { lookupSoilContamination } from "../enrichment-sources/miljoeportalen-v1v2.js";
import { mockModeEnabled, type SourceResult } from "../enrichment-sources/types.js";
import { mapConcurrent } from "../shared/concurrency.js";
import { isDanishCoordinate } from "../shared/map-utils.js";
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

/** How many of the newest sales get a BBR reading for their sale date. Each one is a register call. */
const BBR_AT_SALE_LIMIT = 6;

/**
 * Registered sales for an address picked by id, each with BBR as of its sale date.
 *
 * Houses only, like the valuation: EJF is keyed by BFE, and an apartment has a BFE of its own that this
 * pipeline does not resolve. Using the parcel's BFE for an apartment would show the sales of the whole
 * building as if they were the apartment's. A listing lookup (no husnummer id) has no verified BFE either,
 * so it reports sales as unavailable rather than guess.
 *
 * The BBR reading is best-effort: when it fails the sale is still shown, without it.
 */
async function lookupSalesHistory(args: {
  byId: boolean;
  husnummerId: string | null;
  propertyClass: "house" | "other" | null;
  bfeNummer: string | null;
}): Promise<SourceResult<SoldPriceEntry[]>> {
  if (!args.byId) return { ok: false, error: "sales are looked up only for an address picked by id" };
  if (args.propertyClass !== "house") {
    return { ok: false, error: args.propertyClass === "other" ? "not a house: an apartment's sales are keyed by its own BFE, which address lookup does not resolve" : "the building use is unknown, so the BFE cannot be attributed to this home" };
  }
  if (!args.bfeNummer || !args.husnummerId) return { ok: false, error: "no BFE number for this address" };

  const sales = await lookupRegisteredSales(args.bfeNummer);
  if (!sales.ok) return sales;

  const husnummerId = args.husnummerId;
  const indexed = sales.data.entries.map((entry, index) => ({ entry, index }));
  const entries: SoldPriceEntry[] = await mapConcurrent(indexed, 3, async ({ entry, index }): Promise<SoldPriceEntry> => {
    if (index >= BBR_AT_SALE_LIMIT) return entry;
    const bbr = await lookupBbrAtDate(husnummerId, entry.soldDate);
    if (!bbr.ok) return entry;
    const area = bbr.data.residentialAreaSqm;
    return {
      ...entry,
      bbrAtSale: bbr.data,
      // Price per m² is only stated when BBR had a residential area on that day: no area, no figure.
      pricePerSqm: area !== null ? Math.round(entry.price / area) : null,
      ...(area !== null ? { residentialArea: area, areaDefinition: "residential" as const } : {}),
    };
  });
  return { ok: true, data: entries };
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
  // directly. It is not a free-text guess, and it needs no Datafordeler key.
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
  const husnummerId = cadastral?.idLokalid ?? null;
  const [bbrResult, listingValuationResult, houseLookup, noiseResult, soilResult, landResult, tanksResult] = await Promise.all([
    lookupBbr(husnummerId),
    byId
      ? null
      : lookupEjendomsvurdering({
          husnummerId,
          bfeNummer: cadastral?.bfeNummer ?? null,
          matrikelnr: cadastral?.matrikelnr ?? null,
          ejerlav: cadastral?.ejerlav ?? null,
        }),
    byId ? lookupHouseValuation(cadastral?.idLokalid ?? null) : null,
    // Querying a noise WFS at 0,0 returns a confident-looking "no noise here"
    // for a point in the Atlantic, so an unresolvable address skips the call
    // rather than answering it wrongly.
    hasCoordinates ? lookupNoiseExposure(lat, lon) : null,
    hasCoordinates ? lookupSoilContamination(lat, lon) : null,
    // MAT and the BBR tank register are keyed by the husnummer (through its BFE for MAT), not by coordinates.
    lookupLand({
      husnummerId,
      bfeNummer: cadastral?.bfeNummer ?? null,
      matrikelnr: cadastral?.matrikelnr ?? null,
      ejerlavskode: cadastral?.ejerlavskode ?? null,
    }),
    lookupBbrTanks(husnummerId),
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
  const land = landResult.ok && !mockModeEnabled("MATRIKEL_MOCK_MODE") ? landResult.data : null;
  const tanks = tanksResult.ok && !mockModeEnabled("BBR_MOCK_MODE") ? tanksResult.data : null;
  // The valuation behind the checklist: the latest year and the one before it, whichever path found it.
  const valuationForFlags = byId
    ? valuationFromYears(valuationHistory)
    : listingValuationResult?.ok && !mockModeEnabled("EJENDOMSVURDERING_MOCK_MODE")
      ? listingValuationResult.data
      : null;
  const noise = noiseResult?.ok && !mockModeEnabled("STOEJKORT_MOCK_MODE") ? noiseResult.data : null;
  const noiseExposureLden = noise?.ldenDb ?? null;
  const soil = soilResult?.ok && !mockModeEnabled("MILJOEPORTALEN_MOCK_MODE") ? soilResult.data : null;
  // A listing lookup does not attempt sales (no verified BFE), so it reports no sales source at all rather than
  // an "unavailable" one that would pull the whole report's data mode down for a source nobody asked.
  const salesResult = !byId ? null : await lookupSalesHistory({ byId, husnummerId, propertyClass: houseLookup?.propertyClass ?? null, bfeNummer: houseLookup?.bfeNummer ?? null });
  const sales = salesResult?.ok ? { priceHistory: salesResult.data, historyMatch: "matched" as const, nearbySales: [] } : null;

  const addressRegisterLabel = input.husnummerId
    ? "DAR via Adressevælger (adressevaelger.dk)"
    : cadastral?.resolvedVia === "adressevaelger"
      ? "DAR via Adressevælger (adressevaelger.dk)"
      : "DAR via Datafordeler GraphQL";

  const sources: PropertyLookupSourceStatus[] = [
    status("address", addressRegisterLabel, addressMockFlag, cadastralResult),
    status("bbr", "BBR via Datafordeler GraphQL", "BBR_MOCK_MODE", bbrResult),
    status("oilTanks", "BBR tekniske anlæg via Datafordeler GraphQL", "BBR_MOCK_MODE", tanksResult),
    status("land", "MAT via Datafordeler GraphQL", "MATRIKEL_MOCK_MODE", landResult),
    status("publicValuation", "VUR via Datafordeler GraphQL", valuationMockFlag, valuationResult),
    ...(salesResult ? [status("sales", "EJF via Datafordeler GraphQL, BBR på salgsdatoen", null, salesResult)] : []),
    noiseResult === null
      ? {
          key: "noise" as const,
          register: NOISE_REGISTER,
          mode: "unavailable" as const,
          error: "no usable coordinates for the address",
        }
      : status("noise", NOISE_REGISTER, "STOEJKORT_MOCK_MODE", noiseResult),
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
      ? buildAddressRiskFlags({ municipalityCode: cadastral.municipalityCode ?? null, bbr: bbrBuilding, noise, soil, tanks, land, valuation: valuationForFlags })
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

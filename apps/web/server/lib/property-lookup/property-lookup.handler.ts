import type {
  PropertyLookupInput,
  PropertyLookupResult,
} from "../../../../../packages/shared/src/types/property-lookup.js";
import { lookupAddressCadastral } from "../enrichment-sources/address-lookup.js";
import { lookupBbr } from "../enrichment-sources/bbr.js";
import { lookupEjendomsvurdering } from "../enrichment-sources/ejendomsvurdering.js";
import { lookupNoiseExposure } from "../enrichment-sources/stoejkort.js";
import { DEFAULT_FINANCING_ASSUMPTIONS, type FinancingAssumptions } from "../screening/config/financing-assumptions.js";
import { classifyRenovationCategory } from "../screening/renovation-category.js";
import { evaluateScreening } from "../screening/symbol-engine.js";
import { extractScoringInputs } from "../scoring/relative-score-inputs.js";

/**
 * Orchestrates the property-lookup pipeline: DAR (free-text address ->
 * cadastral identifiers) -> BBR + OIS (building facts + public valuation) ->
 * screening (hard criteria) -> scoring inputs. Every enrichment-sources
 * lookup already gates its own mock/real split independently (its own
 * `..._MOCK_MODE` flag), same pattern as `enrich.ts` — this handler just
 * composes their results. Every value in the returned payload is tagged
 * `source: "ai"`; this endpoint never asserts `source: "verified"`, since
 * verifying (encumbrances, servitutter, tilstandsrapport) stays a human
 * decision, not something an automated lookup can assert about itself.
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

  const [bbrResult, valuationResult, noiseResult] = await Promise.all([
    lookupBbr(cadastral?.idLokalid ?? null),
    lookupEjendomsvurdering(cadastral?.matrikelnr ?? null, cadastral?.ejerlav ?? null),
    lookupNoiseExposure(input.lat ?? 0, input.lon ?? 0),
  ]);

  const bbrBuilding = bbrResult.ok ? bbrResult.data : null;
  const publicValuation = valuationResult.ok ? valuationResult.data : null;
  const noiseExposureLden = noiseResult.ok ? noiseResult.data.ldenDb : null;

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
      zone: cadastral?.zone ?? null,
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
    source: "ai",
  };
}

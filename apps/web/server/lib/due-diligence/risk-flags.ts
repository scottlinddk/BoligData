import type { LandRegistration, OilTankRegistry, OilTankRiskSource, RiskFlags, ValuationCheck } from "../../../../../packages/shared/src/types/index.js";
import type { EjendomsvurderingData } from "../enrichment-sources/ejendomsvurdering.js";
import type { SoilContaminationResult } from "../enrichment-sources/miljoeportalen-v1v2.js";
import { buildSpildevandsplanUrl } from "../enrichment-sources/spildevandsplan.js";
import type { NoiseExposure } from "../enrichment-sources/stoejkort.js";
import { TINGLYSNING_ENTRY_URL } from "../enrichment-sources/tinglysning-link.js";
import { buildWeblagerUrl } from "../enrichment-sources/weblager-link.js";

/**
 * BBR heating codes that settle the oil tank question. "oliefyr" is oil. Central heating or stoves whose
 * fuel BBR does not record ("centralvarme", "ovne") could still burn oil, so they settle nothing.
 */
const HEATING_WITHOUT_OIL = new Set(["fjernvarme", "varmepumpe", "elvarme", "naturgasfyr", "fast brændsel", "ingen varmeinstallation"]);

export function oilTankFromHeating(heating: string | null | undefined): { oilTankRisk: boolean; oilTankRiskSource: OilTankRiskSource } | null {
  if (heating === "oliefyr") return { oilTankRisk: true, oilTankRiskSource: "bbr" };
  if (heating && HEATING_WITHOUT_OIL.has(heating)) return { oilTankRisk: false, oilTankRiskSource: "bbr" };
  return null;
}

/**
 * The latest public valuation and the year before it, as the checklist shows them. Null when VUR gave no
 * valuation with a property value.
 */
export function toValuationCheck(valuation: EjendomsvurderingData | null | undefined): ValuationCheck | null {
  if (!valuation || valuation.valuationYear === null || valuation.assessedPropertyValueDkk === null) return null;
  return {
    year: valuation.valuationYear,
    propertyValueDkk: valuation.assessedPropertyValueDkk,
    landValueDkk: valuation.assessedLandValueDkk,
    previousYear: valuation.previousYear,
    previousPropertyValueDkk: valuation.previousPropertyValueDkk,
  };
}

export interface RiskFlagInput {
  /** Municipality name as the link tables key it ("Aalborg"), or null. */
  municipality: string | null;
  /** BBR's decoded heating, only when BBR answered for real; null or undefined otherwise. */
  heating: string | null | undefined;
  /** The noise maps' answer, only when they answered for real. Null means "not asked", which is not "quiet". */
  noise: NoiseExposure | null;
  /** The contamination register's answer, only when it answered for real. Null means unknown. */
  soil: SoilContaminationResult | null;
  /** GEUS soil type, context only. */
  jordart?: string | null;
  /** Attest link built from the parcel, when the parcel is known. */
  parcelAttestUrl?: string | null;
  /** The tanks BBR registers, only when the register answered for real. Null means "not asked", which is not "no tank". */
  tanks?: OilTankRegistry | null;
  /** What Matriklen registers on the land, only when it answered for real. */
  land?: LandRegistration | null;
  /** The public valuation (VUR), only when it answered for real. */
  valuation?: EjendomsvurderingData | null;
  /** The oil tank answer when BBR settles nothing. Listings keep their building-year heuristic; addresses pass null. */
  oilTankFallback?: { oilTankRisk: boolean; oilTankRiskSource: OilTankRiskSource } | null;
}

/**
 * The due-diligence flags in the one shape the checklist renders, for listings (crawl and live page) and
 * looked-up addresses alike. What has no automated source (tingbog, spildevandsplan, byggesager) stays a
 * link the reader follows; what has one is only ever filled from a real answer.
 */
export function buildRiskFlags(input: RiskFlagInput): RiskFlags {
  // A tank BBR still registers as standing is a finding whatever the heating is: a tank outlives the boiler it fed.
  const standingTank = input.tanks?.tanks.some((tank) => !tank.decommissioned) === true;
  const oil = standingTank
    ? { oilTankRisk: true, oilTankRiskSource: "bbr" as const }
    : oilTankFromHeating(input.heating) ?? input.oilTankFallback ?? { oilTankRisk: false, oilTankRiskSource: "heuristic" as const };
  return {
    noiseExposureLden: null,
    noiseBand: input.noise?.band ?? null,
    noiseChecked: input.noise !== null,
    encumbranceCheckRequired: true,
    // tinglysning.dk is searched by address by hand; its entry page is the right link for any address.
    encumbranceLookupUrl: TINGLYSNING_ENTRY_URL,
    sewerSeparationCheckRequired: true,
    sewerSeparationLookupUrl: input.municipality ? buildSpildevandsplanUrl(input.municipality) : null,
    buildingCaseArchiveUrl: input.municipality ? buildWeblagerUrl(input.municipality) : null,
    oilTankRisk: oil.oilTankRisk,
    oilTankRiskSource: oil.oilTankRiskSource,
    heatingInstallation: input.heating ?? null,
    oilTanks: input.tanks ?? null,
    landRegistration: input.land ?? null,
    valuation: toValuationCheck(input.valuation),
    soilContamination: { classification: input.soil?.classification ?? "unknown", jordart: input.jordart ?? null },
    soilContaminationAttestUrl: input.soil?.attestUrl ?? input.parcelAttestUrl ?? null,
    soilContaminationSiteName: input.soil?.locationName ?? null,
  };
}

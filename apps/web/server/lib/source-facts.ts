import type { BbrData, Enrichment, RiskFlags } from "../../../../packages/shared/src/types/index.js";

type EnrichmentRow = Record<string, any>;
export function sourceIsReal(row: EnrichmentRow, group: string): boolean {
  return row.source_status?.[group]?.dataMode === "real";
}
export function emptyBbrData(): BbrData {
  return { yearBuilt: null, renovationYear: null, energyLabel: null, areaSqm: null, buildingType: null,
    heatingInstallation: null, floors: null, roofMaterial: null, wallMaterial: null, basementSqm: null,
    toiletCount: null, bathroomCount: null };
}
export function safeBbrData(row: EnrichmentRow): BbrData | null {
  // The implemented BBR client has no energy-certificate source.
  return sourceIsReal(row, "bbr") && row.bbr_data ? { ...emptyBbrData(), ...row.bbr_data, energyLabel: null } : null;
}
export function safeRiskFlags(row: EnrichmentRow): RiskFlags | null {
  const raw: RiskFlags | undefined = row.risk_flags;
  if (!raw) return null;
  // A "bbr" oil tank answer comes from the heating or from the tank register, so either being real stands behind it.
  const bbrHeatingKnown = (sourceIsReal(row, "bbr") || sourceIsReal(row, "oil_tanks")) && raw.oilTankRiskSource === "bbr";
  const genuineListingHeuristic = sourceIsReal(row, "sales") && raw.oilTankRiskSource === "heuristic";
  return {
    noiseExposureLden: sourceIsReal(row, "noise") && typeof raw.noiseExposureLden === "number" && Number.isFinite(raw.noiseExposureLden) ? raw.noiseExposureLden : null,
    noiseBand: sourceIsReal(row, "noise") ? raw.noiseBand ?? null : null,
    noiseChecked: sourceIsReal(row, "noise") && raw.noiseChecked === true,
    encumbranceCheckRequired: true,
    encumbranceLookupUrl: raw.encumbranceLookupUrl ?? null,
    sewerSeparationCheckRequired: true,
    sewerSeparationLookupUrl: raw.sewerSeparationLookupUrl ?? null,
    buildingCaseArchiveUrl: raw.buildingCaseArchiveUrl ?? null,
    oilTankRisk: (bbrHeatingKnown || genuineListingHeuristic) && raw.oilTankRisk === true,
    oilTankRiskSource: bbrHeatingKnown ? "bbr" : "heuristic",
    soilContamination: {
      classification: sourceIsReal(row, "soil_contamination") ? raw.soilContamination?.classification ?? "unknown" : "unknown",
      jordart: sourceIsReal(row, "soil_type") ? raw.soilContamination?.jordart ?? null : null,
    },
    soilContaminationAttestUrl: raw.soilContaminationAttestUrl ?? null,
    soilContaminationSiteName: sourceIsReal(row, "soil_contamination") ? raw.soilContaminationSiteName ?? null : null,
    heatingInstallation: sourceIsReal(row, "bbr") ? raw.heatingInstallation ?? null : null,
    // Each register's findings only stand when that register's own observation was real, like the fields above.
    oilTanks: sourceIsReal(row, "oil_tanks") ? raw.oilTanks ?? null : null,
    landRegistration: sourceIsReal(row, "land") ? raw.landRegistration ?? null : null,
    valuation: sourceIsReal(row, "valuation") ? raw.valuation ?? null : null,
  };
}

/** For callers whose shape requires a risk object even without a source row. */
export const unknownRiskFlags = (): Enrichment["riskFlags"] => ({
  noiseExposureLden: null, encumbranceCheckRequired: true, encumbranceLookupUrl: null,
  sewerSeparationCheckRequired: true, sewerSeparationLookupUrl: null,
  buildingCaseArchiveUrl: null, oilTankRisk: false,
  oilTankRiskSource: "heuristic", soilContamination: { classification: "unknown", jordart: null },
  soilContaminationAttestUrl: null,
});

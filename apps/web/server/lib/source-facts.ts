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
  const bbrHeatingKnown = sourceIsReal(row, "bbr") && raw.oilTankRiskSource === "bbr";
  const genuineListingHeuristic = sourceIsReal(row, "sales") && raw.oilTankRiskSource === "heuristic";
  return {
    noiseExposureLden: sourceIsReal(row, "noise") && typeof raw.noiseExposureLden === "number" && Number.isFinite(raw.noiseExposureLden) ? raw.noiseExposureLden : null,
    encumbranceCheckRequired: true,
    encumbranceLookupUrl: raw.encumbranceLookupUrl ?? null,
    sewerSeparationCheckRequired: true,
    sewerSeparationLookupUrl: raw.sewerSeparationLookupUrl ?? null,
    oilTankRisk: (bbrHeatingKnown || genuineListingHeuristic) && raw.oilTankRisk === true,
    oilTankRiskSource: bbrHeatingKnown ? "bbr" : "heuristic",
    soilContamination: {
      classification: sourceIsReal(row, "soil_contamination") ? raw.soilContamination?.classification ?? "unknown" : "unknown",
      jordart: sourceIsReal(row, "soil_type") ? raw.soilContamination?.jordart ?? null : null,
    },
    soilContaminationAttestUrl: raw.soilContaminationAttestUrl ?? null,
  };
}

/** For callers whose shape requires a risk object even without a source row. */
export const unknownRiskFlags = (): Enrichment["riskFlags"] => ({
  noiseExposureLden: null, encumbranceCheckRequired: true, encumbranceLookupUrl: null,
  sewerSeparationCheckRequired: true, sewerSeparationLookupUrl: null, oilTankRisk: false,
  oilTankRiskSource: "heuristic", soilContamination: { classification: "unknown", jordart: null },
  soilContaminationAttestUrl: null,
});

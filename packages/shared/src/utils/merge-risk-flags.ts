import type { RiskFlags } from "../types/index.js";
import { riskStatuses } from "./risk-status.js";

/**
 * A listing page has two sets of flags: the ones the crawl stored and the ones its live lookup just built.
 * Each item takes the live answer when the live lookup actually answered it, and the stored one otherwise,
 * so a register that is down right now does not blank out an answer the crawl already has (and a stale
 * stored "unknown" does not hide a live answer).
 */
export function mergeRiskFlags(live: RiskFlags | null, stored: RiskFlags | null): RiskFlags | null {
  if (!live) return stored;
  if (!stored) return live;
  const liveStatus = riskStatuses(live);
  const noise = liveStatus.noise !== "unknown" ? live : stored;
  const oil = liveStatus.oilTank !== "unknown" || riskStatuses(stored).oilTank === "unknown" ? live : stored;
  const soil = liveStatus.soil !== "unknown" ? live : stored;
  return {
    ...live,
    noiseExposureLden: noise.noiseExposureLden,
    noiseBand: noise.noiseBand ?? null,
    noiseChecked: noise.noiseChecked ?? false,
    encumbranceLookupUrl: live.encumbranceLookupUrl ?? stored.encumbranceLookupUrl,
    sewerSeparationLookupUrl: live.sewerSeparationLookupUrl ?? stored.sewerSeparationLookupUrl,
    buildingCaseArchiveUrl: live.buildingCaseArchiveUrl ?? stored.buildingCaseArchiveUrl ?? null,
    oilTanks: live.oilTanks ?? stored.oilTanks ?? null,
    landRegistration: live.landRegistration ?? stored.landRegistration ?? null,
    valuation: live.valuation ?? stored.valuation ?? null,
    oilTankRisk: oil.oilTankRisk,
    oilTankRiskSource: oil.oilTankRiskSource,
    heatingInstallation: oil.heatingInstallation ?? null,
    soilContamination: { classification: soil.soilContamination?.classification ?? "unknown", jordart: live.soilContamination?.jordart ?? stored.soilContamination?.jordart ?? null },
    soilContaminationAttestUrl: soil.soilContaminationAttestUrl ?? live.soilContaminationAttestUrl ?? stored.soilContaminationAttestUrl ?? null,
    soilContaminationSiteName: soil.soilContaminationSiteName ?? null,
  };
}

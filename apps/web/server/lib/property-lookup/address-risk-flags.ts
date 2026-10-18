import type { LandRegistration, OilTankRegistry, RiskFlags } from "../../../../../packages/shared/src/types/index.js";
import type { EjendomsvurderingData } from "../enrichment-sources/ejendomsvurdering.js";
import type { BbrBuildingData } from "../enrichment-sources/bbr.js";
import type { SoilContaminationResult } from "../enrichment-sources/miljoeportalen-v1v2.js";
import type { NoiseExposure } from "../enrichment-sources/stoejkort.js";
import { buildRiskFlags } from "../due-diligence/risk-flags.js";
import { municipalityNameFromCode } from "../municipalities.js";

export interface AddressRiskInput {
  /** The register's municipality code for the address. */
  municipalityCode: string | null;
  /** The building, only when BBR answered for real. Null otherwise. */
  bbr: Pick<BbrBuildingData, "heatingInstallation"> | null;
  /** The noise maps' answer, only when they answered for real. Null for "not asked", which is not "quiet". */
  noise: NoiseExposure | null;
  /** The soil contamination register's answer, only when it answered for real. */
  soil: SoilContaminationResult | null;
  /** The tanks BBR registers, only when the register answered for real. */
  tanks?: OilTankRegistry | null;
  /** What Matriklen registers on the land, only when it answered for real. */
  land?: LandRegistration | null;
  /** The public valuation, only when VUR answered for real. */
  valuation?: EjendomsvurderingData | null;
}

/**
 * The due-diligence flags from what a live lookup holds, for an address or a listing's page.
 *
 * What it will not do is guess. When BBR does not settle the heating the oil tank stays unknown, since an
 * old building is not evidence of a tank and a young one is not evidence of none. Without a parcel there is
 * no attest link of our own, only the contamination register's link for a mapped site.
 */
export function buildAddressRiskFlags({ municipalityCode, bbr, noise, soil, tanks = null, land = null, valuation = null }: AddressRiskInput): RiskFlags {
  return buildRiskFlags({
    municipality: municipalityNameFromCode(municipalityCode),
    heating: bbr?.heatingInstallation ?? null,
    noise,
    soil,
    tanks,
    land,
    valuation,
    oilTankFallback: null,
  });
}

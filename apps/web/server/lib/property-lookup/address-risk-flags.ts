import type { RiskFlags } from "../../../../../packages/shared/src/types/index.js";
import type { BbrBuildingData } from "../enrichment-sources/bbr.js";
import { buildSpildevandsplanUrl } from "../enrichment-sources/spildevandsplan.js";
import { TINGLYSNING_ENTRY_URL } from "../enrichment-sources/tinglysning-link.js";
import { buildWeblagerUrl } from "../enrichment-sources/weblager-link.js";
import { municipalityNameFromCode } from "../municipalities.js";

export interface AddressRiskInput {
  /** The register's municipality code for the address. */
  municipalityCode: string | null;
  /** The building, only when BBR answered for real. Null otherwise. */
  bbr: Pick<BbrBuildingData, "heatingInstallation"> | null;
  /** Lden in dB, only when the noise source answered for real. Null for "no reading", which is not "quiet". */
  noiseLden: number | null;
}

/**
 * The due-diligence flags for an address that is not a listing, from what its lookup already holds.
 * The same shape the ingest stores for listings (`crawl/enrich.ts`), so the one checklist renders both.
 *
 * What it will not do is guess. The ingest falls back to a building-year heuristic for the oil tank when
 * BBR has no heating; here that case stays unknown, since an old building is not evidence of a tank and a
 * young one is not evidence of none. Soil contamination is not looked up for addresses, so it is unknown
 * and the checklist links the general map. Without a parcel (matrikel, ejerlavskode) there is no
 * jordforureningsattest link either.
 */
export function buildAddressRiskFlags({ municipalityCode, bbr, noiseLden }: AddressRiskInput): RiskFlags {
  const municipality = municipalityNameFromCode(municipalityCode);
  const heating = bbr?.heatingInstallation ?? null;
  return {
    noiseExposureLden: noiseLden,
    encumbranceCheckRequired: true,
    // tinglysning.dk is searched by address by hand; its entry page is the right link for any address.
    encumbranceLookupUrl: TINGLYSNING_ENTRY_URL,
    sewerSeparationCheckRequired: true,
    sewerSeparationLookupUrl: municipality ? buildSpildevandsplanUrl(municipality) : null,
    buildingCaseArchiveUrl: municipality ? buildWeblagerUrl(municipality) : null,
    // `heuristic` + false reads as "unknown" in riskStatuses; only BBR's own heating code makes it a finding.
    oilTankRisk: heating !== null && heating === "oliefyr",
    oilTankRiskSource: heating !== null ? "bbr" : "heuristic",
    soilContamination: { classification: "unknown", jordart: null },
    soilContaminationAttestUrl: null,
  };
}

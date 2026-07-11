import { fetchJson } from "../crawl/http.js";
import { hashSeed, sourceFailed, sourceOk, type SourceResult } from "./types.js";
import type { SoilContaminationClassification } from "../../../../../packages/shared/src/types/index.js";

const MOCK_MODE = process.env.MILJOEPORTALEN_MOCK_MODE !== "false";

/**
 * Danmarks Miljøportal "Forurenede grunde" (V1/V2 kortlagt jord) WFS — the
 * authoritative contamination-registration registry. Distinct from GEUS
 * Jordartskort (soil type only, no registration status). Not one of the
 * originally listed 8 sources; added because that's the only way to produce
 * the checklist's real "no marking registered" vs V1/V2 status.
 *
 * Endpoint/layer name not yet verified against live Miljøportalen docs (they
 * 403'd automated fetches during research) — confirm the exact WFS
 * GetCapabilities/DescribeFeatureType response before flipping
 * MILJOEPORTALEN_MOCK_MODE=false.
 */
const API_BASE = process.env.MILJOEPORTALEN_API_BASE ?? "https://arealdata.miljoeportal.dk/wfs/forurenede-grunde";

interface MiljoeportalenFeature {
  properties?: { klassificering?: unknown };
}
interface MiljoeportalenResponse {
  features?: MiljoeportalenFeature[];
}

function mockClassification(lat: number, lon: number): SoilContaminationClassification {
  const seed = hashSeed(`${lat.toFixed(4)},${lon.toFixed(4)}`);
  if (seed % 20 === 0) return "v2";
  if (seed % 7 === 0) return "v1";
  return "none";
}

/**
 * Looks up whether a point falls within a registered V1 (possibly
 * contaminated) or V2 (confirmed contaminated) area. "none" means queried
 * and clear; a failed/mocked lookup returns "unknown" (never conflated with
 * "none", which is a positive claim about the registry).
 */
export async function lookupSoilContamination(
  lat: number,
  lon: number,
): Promise<SourceResult<{ classification: SoilContaminationClassification }>> {
  if (MOCK_MODE) return sourceOk({ classification: mockClassification(lat, lon) });

  try {
    const params = new URLSearchParams({
      service: "WFS",
      request: "GetFeature",
      typeName: "forurenede_grunde",
      outputFormat: "application/json",
      bbox: `${lon - 0.0005},${lat - 0.0005},${lon + 0.0005},${lat + 0.0005},EPSG:4326`,
    });
    const body = await fetchJson<MiljoeportalenResponse>(`${API_BASE}?${params}`);
    const feature = body.features?.[0];
    const raw = String(feature?.properties?.klassificering ?? "").toLowerCase();
    const classification: SoilContaminationClassification =
      raw === "v1" || raw === "v2" ? raw : feature ? "unknown" : "none";
    return sourceOk({ classification });
  } catch (err) {
    return sourceFailed(err);
  }
}

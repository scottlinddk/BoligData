import { fetchJson } from "../crawl/http.js";
import { asNonEmptyString } from "../crawl/map-utils.js";
import { hashSeed, sourceFailed, sourceOk, type SourceResult } from "./types.js";

const MOCK_MODE = process.env.GEUS_MOCK_MODE !== "false";

/** GEUS Jordartskort — free Esri Feature Layer, point query, no auth. Context only, never authoritative for contamination status. */
const API_BASE = process.env.GEUS_API_BASE ?? "https://kort.vd.dk/server/rest/services/Grunddata/Jordartskort_GEUS/MapServer/1/query";

const JORDARTER = ["Moræneler", "Smeltevandssand", "Smeltevandsgrus", "Ferskvandstørv", "Postglacialt ler", "Moræne­sand"];

interface GeusQueryResponse {
  features?: Array<{ attributes?: { jordart?: unknown; TSYM?: unknown } }>;
}

function mockJordart(lat: number, lon: number): string {
  const seed = hashSeed(`${lat.toFixed(4)},${lon.toFixed(4)}`);
  return JORDARTER[seed % JORDARTER.length]!;
}

/** Looks up the GEUS soil-type classification (jordart) at a point — permeability/radon context for the soil checklist item. */
export async function lookupSoilType(lat: number, lon: number): Promise<SourceResult<{ jordart: string | null }>> {
  if (MOCK_MODE) return sourceOk({ jordart: mockJordart(lat, lon) });

  try {
    const params = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      outFields: "jordart,TSYM",
      f: "json",
    });
    const body = await fetchJson<GeusQueryResponse>(`${API_BASE}?${params}`);
    const attrs = body.features?.[0]?.attributes;
    const jordart = asNonEmptyString(attrs?.jordart) ?? asNonEmptyString(attrs?.TSYM);
    return sourceOk({ jordart });
  } catch (err) {
    return sourceFailed(err);
  }
}

import { fetchJson } from "../crawl/http.js";
import { toUtm32 } from "../miljoegis-noise/geometry.js";
import { hashSeed, mockModeEnabled, sourceFailed, sourceOk, type SourceResult } from "./types.js";
import type { SoilContaminationClassification } from "../../../../../packages/shared/src/types/index.js";

/**
 * Danmarks Miljøportal's soil contamination register (DKJord): the regions' V1 (possibly contaminated) and
 * V2 (contaminated) mapped areas, the register a jordforureningsattest is printed from.
 *
 * Verified live 18 October 2026: `https://jord.miljoeportal.dk/geo/wfs` is an open GeoServer WFS 2.0.0 with
 * the layers `DKJord:View_V1Flader` and `DKJord:View_V2Flader` (geometry `Fladegeometri`, native
 * EPSG:25832), answering `application/json`. A point query with `INTERSECTS(... SRID=25832;POINT(x y))`
 * returned the V2 site "Nedlagt gasværk, Nyhavnsgade" (851-00149) for a point inside it and nothing for a
 * point outside. The previous guess (`arealdata.miljoeportal.dk/wfs/forurenede-grunde`) answered HTTP 406.
 *
 * The test is the address point against the mapped areas. A parcel that is mapped only away from its
 * address point reads as "none", which is why the checklist keeps the jordforureningsattest link.
 */
const API_BASE = process.env.MILJOEPORTALEN_API_BASE ?? "https://jord.miljoeportal.dk/geo/wfs";
const LAYERS = { v1: "DKJord:View_V1Flader", v2: "DKJord:View_V2Flader" } as const;
/** A response at this many features may be truncated, which is still a hit. */
const MAX_FEATURES = 5;

interface DkJordFeature {
  properties?: { Lokalitetsnr?: unknown; Lokalitetsnavn?: unknown; Jordforureningsattester?: unknown };
}
interface DkJordResponse {
  features?: DkJordFeature[];
}

export interface SoilContaminationResult {
  classification: SoilContaminationClassification;
  /** The register's own attest link for the mapped site, when it gave one. */
  attestUrl?: string | null;
  /** The site's name in the register, e.g. "Nedlagt gasværk, Nyhavnsgade". */
  locationName?: string | null;
}

export function buildDkJordQuery(layer: string, easting: number, northing: number): string {
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: layer,
    outputFormat: "application/json",
    count: String(MAX_FEATURES),
    propertyName: "Lokalitetsnr,Lokalitetsnavn,Jordforureningsattester",
    CQL_FILTER: `INTERSECTS(Fladegeometri,SRID=25832;POINT(${easting.toFixed(2)} ${northing.toFixed(2)}))`,
  });
  return `${API_BASE}?${params}`;
}

function firstHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.split(";").map((part) => part.trim()).find((part) => part.startsWith("https://jord.miljoeportal.dk/"));
  return url ?? null;
}

async function layerHits(layer: string, easting: number, northing: number): Promise<DkJordFeature[]> {
  const body = await fetchJson<DkJordResponse>(buildDkJordQuery(layer, easting, northing));
  if (!Array.isArray(body?.features)) throw new Error("Contamination source did not return a feature collection");
  return body.features;
}

function mockClassification(lat: number, lon: number): SoilContaminationClassification {
  const seed = hashSeed(`${lat.toFixed(4)},${lon.toFixed(4)}`);
  if (seed % 20 === 0) return "v2";
  if (seed % 7 === 0) return "v1";
  return "none";
}

/**
 * Whether the point lies in a V1 or V2 mapped area. "none" means both layers were queried and neither had
 * the point; any failed layer fails the lookup, so a missing answer is never reported as clear.
 */
export async function lookupSoilContamination(lat: number, lon: number): Promise<SourceResult<SoilContaminationResult>> {
  if (mockModeEnabled("MILJOEPORTALEN_MOCK_MODE")) return sourceOk({ classification: mockClassification(lat, lon) });
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 54 || lat > 58 || lon < 7 || lon > 16) {
    return sourceFailed("no Danish coordinates to look up");
  }

  try {
    const [easting, northing] = toUtm32(lat, lon);
    const [v1, v2] = await Promise.all([layerHits(LAYERS.v1, easting, northing), layerHits(LAYERS.v2, easting, northing)]);
    const hit = v2[0] ?? v1[0] ?? null;
    const classification: SoilContaminationClassification = v2.length > 0 ? "v2" : v1.length > 0 ? "v1" : "none";
    return sourceOk({
      classification,
      attestUrl: firstHttpsUrl(hit?.properties?.Jordforureningsattester),
      locationName: typeof hit?.properties?.Lokalitetsnavn === "string" ? hit.properties.Lokalitetsnavn : null,
    });
  } catch (err) {
    return sourceFailed(err);
  }
}

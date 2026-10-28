import type { NoiseBand, NoiseBandSource } from "../../../../../packages/shared/src/types/index.js";
import { fetchJson } from "../shared/http.js";
import { toUtm32 } from "../miljoegis-noise/geometry.js";
import { hashSeed, mockModeEnabled, sourceFailed, sourceOk, type SourceResult } from "./types.js";

const MOCK_FLAG = "STOEJKORT_MOCK_MODE";

/**
 * Road and rail noise (Lden at 1.5 m) at one point, for the due-diligence checklist's yes/no.
 *
 * Source: Miljøstyrelsen's open GeoServer WFS `https://wfs2-miljoegis.mim.dk/stoej/ows`, the EU noise
 * mapping layers listed below. Verified live 18 October 2026: a point query with
 * `INTERSECTS(wkb_geometry,SRID=25832;POINT(x y))` answers in about one second, and a point by Vesterbro in
 * Aalborg returned the nested bands 55–59 up to 75+ on "Veje i by". The layers' own dates are 2017
 * (rail) and undated or 2020 (roads), and they cover what the EU directive maps: roads and railways in the
 * four largest towns (Copenhagen, Aarhus, Odense, Aalborg) and major roads and railways everywhere. Smaller
 * roads outside those towns are not mapped, so "no band" means "not in a mapped noise zone", nothing more.
 *
 * Why not the 2022 Danish (Nord2000) maps: those are only reachable through MiljøGIS's own map process
 * (`miljoegis-noise/source.ts`), which took 12 to 37 seconds per layer and up to 6.7 MB per answer in the
 * same test. The listing page's noise panel keeps using them for the detailed reading.
 *
 * Bands: the layers carry either `db_low`/`db_high` or only the EU class index `noise_in`. On
 * `a1_mroad_lden_1_5`, which has both, `noise_in` 5/4/3/2/1 is `db_low` 55/60/65/70/75 (checked on all
 * 3,000 features), the END standard bands 55–59 … 75+. The top band is open (`db_high` 99), kept as null.
 */
const API_BASE = process.env.STOEJKORT_API_BASE ?? "https://wfs2-miljoegis.mim.dk/stoej/ows";

/** Each layer is asked only for fields it has: GeoServer answers HTTP 400 to an unknown `propertyName`. */
export const NOISE_SCREENING_LAYERS: ReadonlyArray<{ typeName: string; source: NoiseBandSource; fields: string }> = [
  { typeName: "stoej:b1_dk_aggroad_lden1_5_test", source: "roads_in_towns", fields: "db_low,db_high,noise_in" },
  { typeName: "stoej:a1_mroad_lden_1_5", source: "major_roads", fields: "db_low,db_high,noise_in" },
  { typeName: "stoej:d1_mtr_agg_rail_lden_1_5", source: "rail_in_towns", fields: "noise_in" },
  { typeName: "stoej:c1_mva_agg_rail_lden_1_5", source: "rail_in_towns", fields: "noise_in" },
  { typeName: "stoej:c1_bdk_mrail_lden_1_5", source: "major_rail", fields: "noise_in" },
  { typeName: "stoej:c1_sob_mrail_lden_1_5", source: "major_rail", fields: "noise_in" },
  { typeName: "stoej:c1_ores_mrail_lden_1_5", source: "major_rail", fields: "noise_in" },
];

/** Bands per layer are nested polygons, so a loud point matches several; a few is plenty. */
const MAX_FEATURES = 10;
const NOISE_IN_TO_LOWER_DB: Record<number, number> = { 5: 55, 4: 60, 3: 65, 2: 70, 1: 75 };

interface StoejFeature {
  properties?: Record<string, unknown>;
}
interface StoejResponse {
  features?: StoejFeature[];
}

export interface NoiseExposure {
  /** The lower bound of the loudest band at the point, or null when no band covers it. Not a measurement. */
  ldenDb: number | null;
  band: NoiseBand | null;
}

/** Deterministic mock Lden value (dB) in a realistic range, for local development only. */
export function mockNoiseExposure(lat: number, lon: number): number {
  const seed = hashSeed(`${lat.toFixed(4)},${lon.toFixed(4)}`);
  return 40 + (seed % 25);
}

export function buildNoiseScreeningUrl(typeName: string, easting: number, northing: number, fields = "noise_in"): string {
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: typeName,
    outputFormat: "application/json",
    count: String(MAX_FEATURES),
    propertyName: fields,
    CQL_FILTER: `INTERSECTS(wkb_geometry,SRID=25832;POINT(${easting.toFixed(2)} ${northing.toFixed(2)}))`,
  });
  return `${API_BASE}?${params}`;
}

function finite(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

/** One feature's band, or null when it carries neither a usable `db_low` nor a known `noise_in` class. */
export function readBand(properties: Record<string, unknown> | undefined, source: NoiseBandSource): NoiseBand | null {
  if (!properties) return null;
  const dbLow = finite(properties.db_low);
  const lowerDb = dbLow !== null && dbLow >= 40 && dbLow <= 90 ? dbLow : NOISE_IN_TO_LOWER_DB[finite(properties.noise_in) ?? -1] ?? null;
  if (lowerDb === null) return null;
  const dbHigh = finite(properties.db_high);
  const upperDb = dbHigh !== null && dbHigh > lowerDb && dbHigh < 99 ? dbHigh : lowerDb >= 75 ? null : lowerDb + 4;
  return { lowerDb, upperDb, source };
}

const louder = (a: NoiseBand | null, b: NoiseBand | null): NoiseBand | null =>
  a === null ? b : b === null ? a : b.lowerDb > a.lowerDb ? b : a;

/**
 * The loudest mapped band at the point across all road and rail layers. `band: null` is a real answer
 * (every layer was asked and none covers the point); any layer failing fails the whole lookup, so a gap in
 * the answer is never read as quiet.
 */
export async function lookupNoiseExposure(lat: number, lon: number): Promise<SourceResult<NoiseExposure>> {
  if (mockModeEnabled(MOCK_FLAG)) {
    const ldenDb = mockNoiseExposure(lat, lon);
    return sourceOk({ ldenDb, band: null });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 54 || lat > 58 || lon < 7 || lon > 16) {
    return sourceFailed("no Danish coordinates to look up");
  }

  try {
    const [easting, northing] = toUtm32(lat, lon);
    const perLayer = await Promise.all(
      NOISE_SCREENING_LAYERS.map(async ({ typeName, source, fields }) => {
        const body = await fetchJson<StoejResponse>(buildNoiseScreeningUrl(typeName, easting, northing, fields));
        if (!Array.isArray(body?.features)) throw new Error(`Noise layer ${typeName} did not return a feature collection`);
        return body.features.reduce<NoiseBand | null>((loudest, feature) => louder(loudest, readBand(feature.properties, source)), null);
      }),
    );
    const band = perLayer.reduce<NoiseBand | null>(louder, null);
    return sourceOk({ ldenDb: band?.lowerDb ?? null, band });
  } catch (err) {
    return sourceFailed(err);
  }
}

/**
 * ETRS89 / UTM zone 32N (EPSG:25832) -> WGS84 latitude/longitude.
 *
 * Datafordeler and Adressevælger publish access points in EPSG:25832, while
 * the rest of this codebase (noise lookup, sales radius, map) works in WGS84.
 * ETRS89 and WGS84 differ by well under a metre in Denmark, so for address
 * resolution they are treated as the same datum and only the projection is
 * undone. Uses the Krüger n-series inverse transverse Mercator on GRS80, the
 * formulation SDFE documents for Danish map projections.
 */
const SEMI_MAJOR = 6_378_137;
const FLATTENING = 1 / 298.257222101;
const SCALE = 0.9996;
const FALSE_EASTING = 500_000;
const CENTRAL_MERIDIAN_DEG = 9;

const n = FLATTENING / (2 - FLATTENING);
const n2 = n * n;
const n3 = n2 * n;
const n4 = n3 * n;
const rectifyingRadius = (SEMI_MAJOR / (1 + n)) * (1 + n2 / 4 + n4 / 64);

const BETA = [
  n / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360,
  n2 / 48 + n3 / 15 - (437 * n4) / 1440,
  (17 * n3) / 480 - (37 * n4) / 840,
  (4397 * n4) / 161_280,
];
const DELTA = [
  2 * n - (2 * n2) / 3 - 2 * n3 + (116 * n4) / 45,
  (7 * n2) / 3 - (8 * n3) / 5 - (227 * n4) / 45,
  (56 * n3) / 15 - (136 * n4) / 35,
  (4279 * n4) / 630,
];

/** Returns null for non-finite input rather than propagating NaN into a register query. */
export function etrs89Utm32ToWgs84(easting: number, northing: number): { lat: number; lon: number } | null {
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) return null;

  const xi = northing / (SCALE * rectifyingRadius);
  const eta = (easting - FALSE_EASTING) / (SCALE * rectifyingRadius);

  let xiPrime = xi;
  let etaPrime = eta;
  BETA.forEach((beta, index) => {
    const j = 2 * (index + 1);
    xiPrime -= beta * Math.sin(j * xi) * Math.cosh(j * eta);
    etaPrime -= beta * Math.cos(j * xi) * Math.sinh(j * eta);
  });

  const chi = Math.asin(Math.sin(xiPrime) / Math.cosh(etaPrime));
  let latitude = chi;
  DELTA.forEach((delta, index) => {
    latitude += delta * Math.sin(2 * (index + 1) * chi);
  });
  const longitudeOffset = Math.atan2(Math.sinh(etaPrime), Math.cos(xiPrime));

  return {
    lat: (latitude * 180) / Math.PI,
    lon: CENTRAL_MERIDIAN_DEG + (longitudeOffset * 180) / Math.PI,
  };
}

/**
 * A value heatmap: the kernel-weighted AVERAGE of a metric around each grid cell.
 *
 * MapLibre's built-in heatmap layer sums point weights, so a street with many sales looks "hotter"
 * than a street with one very expensive sale, whatever the metric says. For price, discount and days
 * on market the question is "how high is the value here", not "how many sales are here", so the
 * colour comes from the weighted mean, and the number of nearby sales only decides how opaque the
 * cell is (little evidence, faint colour).
 */
export interface SurfacePoint {
  lat: number;
  lon: number;
  value: number;
}

export interface SurfaceOptions {
  /** Side of a grid cell in metres. */
  cellMeters?: number;
  /** Gaussian bandwidth (sigma) in metres: how far a sale's influence reaches. */
  bandwidthMeters?: number;
  /** Cells whose summed kernel weight is below this are not drawn. */
  minSupport?: number;
}

export interface SurfaceCell {
  type: "Feature";
  geometry: { type: "Polygon"; coordinates: [Array<[number, number]>] };
  properties: { value: number; /** 0..1 */ support: number };
}

export interface SurfaceCollection {
  type: "FeatureCollection";
  features: SurfaceCell[];
}

const METERS_PER_DEGREE_LAT = 111_320;

export function buildSurface(points: readonly SurfacePoint[], options: SurfaceOptions = {}): SurfaceCollection {
  const cell = options.cellMeters ?? 100;
  const sigma = options.bandwidthMeters ?? 250;
  const minSupport = options.minSupport ?? 0.15;
  const empty: SurfaceCollection = { type: "FeatureCollection", features: [] };
  if (points.length === 0) return empty;

  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lon0 = points.reduce((s, p) => s + p.lon, 0) / points.length;
  const mPerDegLon = METERS_PER_DEGREE_LAT * Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map((p) => (p.lon - lon0) * mPerDegLon);
  const ys = points.map((p) => (p.lat - lat0) * METERS_PER_DEGREE_LAT);

  // Beyond ~2.2 sigma a sale adds < 0.09 weight, so the grid stops there.
  const reach = sigma * 2.2;
  const minX = Math.floor((Math.min(...xs) - reach) / cell) * cell;
  const maxX = Math.ceil((Math.max(...xs) + reach) / cell) * cell;
  const minY = Math.floor((Math.min(...ys) - reach) / cell) * cell;
  const maxY = Math.ceil((Math.max(...ys) + reach) / cell) * cell;
  const twoSigmaSq = 2 * sigma * sigma;
  const reachSq = reach * reach;

  const features: SurfaceCell[] = [];
  for (let x = minX; x < maxX; x += cell) {
    for (let y = minY; y < maxY; y += cell) {
      const cx = x + cell / 2;
      const cy = y + cell / 2;
      let weight = 0;
      let weighted = 0;
      for (let i = 0; i < points.length; i++) {
        const d2 = (xs[i]! - cx) ** 2 + (ys[i]! - cy) ** 2;
        if (d2 > reachSq) continue;
        const w = Math.exp(-d2 / twoSigmaSq);
        weight += w;
        weighted += w * points[i]!.value;
      }
      if (weight < minSupport) continue;
      const toLon = (mx: number) => lon0 + mx / mPerDegLon;
      const toLat = (my: number) => lat0 + my / METERS_PER_DEGREE_LAT;
      features.push({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[
            [toLon(x), toLat(y)], [toLon(x + cell), toLat(y)], [toLon(x + cell), toLat(y + cell)],
            [toLon(x), toLat(y + cell)], [toLon(x), toLat(y)],
          ]],
        },
        properties: { value: weighted / weight, support: Math.min(1, weight) },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/** Colour-scale domain from the 5th to 95th percentile, so one extreme sale does not flatten the ramp. */
export function colorDomain(values: readonly number[]): [number, number] | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const at = (q: number) => {
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
  };
  const low = at(0.05);
  const high = at(0.95);
  return low === high ? [low - 1, high + 1] : [low, high];
}

/** Sequential light-to-dark ramp (ColorBrewer YlOrRd), identical on the legend and on the map. */
export const RAMP: readonly string[] = ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"];

/** MapLibre `interpolate` expression over `["get", property]`, spread evenly across the domain. */
export function rampExpression(property: string, domain: [number, number]): unknown[] {
  const [low, high] = domain;
  const stops = RAMP.flatMap((color, i) => [low + ((high - low) * i) / (RAMP.length - 1), color]);
  return ["interpolate", ["linear"], ["get", property], ...stops];
}

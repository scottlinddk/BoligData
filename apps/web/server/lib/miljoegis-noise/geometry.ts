import { parseCadastralGeometry } from "../cadastral/geometry.js";

export type Point = [number, number];

/** Forward transverse Mercator on GRS80, fixed UTM zone 32N (EPSG:25832).
 * WGS84 listing coordinates are used at mapping precision; no survey/epoch claim.
 * Series terms follow USGS Professional Paper 1395, equations 8-9 through 8-15.
 */
export function toUtm32(latitude: number, longitude: number): Point {
  const phi = latitude * Math.PI / 180;
  const lambda = (longitude - 9) * Math.PI / 180;
  const a = 6_378_137, e2 = 0.00669438002290, k0 = 0.9996;
  const ep2 = e2 / (1 - e2);
  const sin = Math.sin(phi), cos = Math.cos(phi), tan = Math.tan(phi);
  const n = a / Math.sqrt(1 - e2 * sin * sin);
  const t = tan * tan, c = ep2 * cos * cos, A = cos * lambda;
  const m = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi)
    - 35 * e2 ** 3 / 3072 * Math.sin(6 * phi));
  return [500_000 + k0 * n * (A + (1 - t + c) * A ** 3 / 6 + (5 - 18 * t + t * t + 72 * c - 58 * ep2) * A ** 5 / 120),
    k0 * (m + n * tan * (A * A / 2 + (5 - t + 9 * c + 4 * c * c) * A ** 4 / 24 + (61 - 58 * t + t * t + 600 * c - 330 * ep2) * A ** 6 / 720))];
}

function ringRelation(point: Point, ring: Point[]): "inside" | "outside" | "boundary" {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j]!, [bx, by] = ring[i]!;
    const dx = bx - ax, dy = by - ay;
    const t = dx * dx + dy * dy === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    // Be conservative close to a contour, given address/georeferencing precision.
    if (Math.hypot(x - ax - t * dx, y - ay - t * dy) <= 1) return "boundary";
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside ? "inside" : "outside";
}

/** Independently check exact polygon containment including holes, never a bbox hit. */
export function pointInNoiseGeometry(point: Point, wkt: unknown): "inside" | "outside" | "boundary" | "invalid" {
  const geometry = parseCadastralGeometry({ crs: 25832, wkt });
  if (!geometry) return "invalid";
  let inside = false;
  for (const polygon of geometry.polygons) {
    const outer = ringRelation(point, polygon[0]!);
    if (outer === "boundary") return "boundary";
    if (outer === "outside") continue;
    let inHole = false;
    for (const hole of polygon.slice(1)) {
      const relation = ringRelation(point, hole);
      if (relation === "boundary") return "boundary";
      if (relation === "inside") inHole = true;
    }
    if (!inHole) inside = true;
  }
  return inside ? "inside" : "outside";
}

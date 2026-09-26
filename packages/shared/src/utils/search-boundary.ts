/** Search rings use longitude/latitude, with no repeated closing vertex internally. */
export type SearchBoundaryPoint = [number, number];
export const MAX_SEARCH_BOUNDARY_VERTICES = 64;
const EPSILON = 1e-12;

function isPoint(value: unknown): value is SearchBoundaryPoint {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "number" && typeof value[1] === "number" &&
    Number.isFinite(value[0]) && Number.isFinite(value[1]) && value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90;
}
const samePoint = (a: SearchBoundaryPoint, b: SearchBoundaryPoint) => a[0] === b[0] && a[1] === b[1];
const cross = (a: SearchBoundaryPoint, b: SearchBoundaryPoint, c: SearchBoundaryPoint) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSegment = (point: SearchBoundaryPoint, a: SearchBoundaryPoint, b: SearchBoundaryPoint) =>
  Math.abs(cross(a, b, point)) <= EPSILON && point[0] >= Math.min(a[0], b[0]) - EPSILON && point[0] <= Math.max(a[0], b[0]) + EPSILON &&
  point[1] >= Math.min(a[1], b[1]) - EPSILON && point[1] <= Math.max(a[1], b[1]) + EPSILON;

function segmentsIntersect(a: SearchBoundaryPoint, b: SearchBoundaryPoint, c: SearchBoundaryPoint, d: SearchBoundaryPoint): boolean {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) &&
      ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
  return onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d);
}

function signedAreaTwice(points: SearchBoundaryPoint[]): number {
  let area = 0;
  for (let i = 1; i < points.length - 1; i++) area += cross(points[0]!, points[i]!, points[i + 1]!);
  return area;
}

/** Missing and invalid inputs both return null; callers must distinguish absence from invalid provided input. */
export function parseSearchBoundary(input: unknown): SearchBoundaryPoint[] | null {
  let value = input;
  if (typeof value === "string") {
    if (!value.trim() || value.length > 16_384) return null;
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!Array.isArray(value) || value.length < 3 || value.length > MAX_SEARCH_BOUNDARY_VERTICES + 1 || !value.every(isPoint)) return null;
  const points: SearchBoundaryPoint[] = value.map(([lon, lat]) => [Object.is(lon, -0) ? 0 : lon, Object.is(lat, -0) ? 0 : lat]);
  if (samePoint(points[0]!, points[points.length - 1]!)) points.pop();
  if (points.length < 3 || points.length > MAX_SEARCH_BOUNDARY_VERTICES || new Set(points.map(point => JSON.stringify(point))).size !== points.length) return null;
  // Drawn areas use local map geometry, so do not accept ambiguous world-spanning/date-line rings.
  if (Math.max(...points.map(point => point[0])) - Math.min(...points.map(point => point[0])) >= 180) return null;
  if (Math.abs(signedAreaTwice(points)) <= EPSILON) return null;
  for (let i = 0; i < points.length; i++) {
    const previous = points[(i + points.length - 1) % points.length]!;
    const current = points[i]!;
    const next = points[(i + 1) % points.length]!;
    // Adjacent collinear edges may continue, but may not double back over one another.
    if (Math.abs(cross(previous, current, next)) <= EPSILON &&
        (previous[0] - current[0]) * (next[0] - current[0]) + (previous[1] - current[1]) * (next[1] - current[1]) > EPSILON) return null;
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (segmentsIntersect(current, next, points[j]!, points[(j + 1) % points.length]!)) return null;
    }
  }
  return points;
}

/** Stable counterclockwise ring starting at the lexicographically smallest vertex. */
export function serializeSearchBoundary(input: readonly SearchBoundaryPoint[]): string {
  const points = parseSearchBoundary(input);
  if (!points) throw new RangeError("Invalid search boundary: draw a simple area with 3–64 distinct points");
  if (signedAreaTwice(points) < 0) points.reverse();
  let start = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i]![0] < points[start]![0] || (points[i]![0] === points[start]![0] && points[i]![1] < points[start]![1])) start = i;
  }
  return JSON.stringify([...points.slice(start), ...points.slice(0, start)]);
}

export function searchBoundaryBbox(input: unknown): [number, number, number, number] | null {
  const points = parseSearchBoundary(input);
  return points ? [Math.min(...points.map(point => point[0])), Math.min(...points.map(point => point[1])), Math.max(...points.map(point => point[0])), Math.max(...points.map(point => point[1]))] : null;
}

/** Boundary-inclusive local geometry helper for previews/tests; production search runs in PostGIS. */
export function searchBoundaryContains(point: SearchBoundaryPoint, input: unknown): boolean {
  const points = parseSearchBoundary(input);
  if (!points || !isPoint(point)) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!, b = points[j]!;
    if (onSegment(point, a, b)) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

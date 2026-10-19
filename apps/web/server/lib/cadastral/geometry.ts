import type { CadastralGeometry } from "../../../../../packages/shared/src/types/cadastral.js";

/** Accept the register's 2D polygon WKT only. Never draw coordinates in an unknown CRS. */
export function parseCadastralGeometry(value: unknown): CadastralGeometry | null {
  if (!value || typeof value !== "object") return null;
  const { wkt, crs } = value as Record<string, unknown>;
  if (crs !== 25832 || typeof wkt !== "string" || wkt.length > 500_000) return null;
  const match = /^(POLYGON|MULTIPOLYGON)\s*(\(.+\))$/i.exec(wkt.trim());
  if (!match) return null;
  const tokens = match[2]!.match(/[()]|,|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi);
  if (!tokens || tokens.join("") !== match[2]!.replace(/\s/g, "")) return null;
  let index = 0;
  function group(depth: number): unknown[] {
    if (depth > 3 || tokens![index++] !== "(") throw new Error("Invalid geometry");
    const items: unknown[] = [];
    while (index < tokens!.length) {
      if (tokens![index] === "(") items.push(group(depth + 1));
      else {
        const x = Number(tokens![index++]), y = Number(tokens![index++]);
        // Denmark's UTM32 envelope, including Bornholm. Reject invalid/outlandish coordinates.
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 100_000 || x > 1_000_000 || y < 6_000_000 || y > 6_500_000) throw new Error("Invalid coordinate");
        items.push([x, y]);
      }
      const separator = tokens![index++];
      if (separator === ")") return items;
      if (separator !== ",") throw new Error("Invalid separator");
    }
    throw new Error("Unclosed geometry");
  }
  try {
    const parsed = group(1);
    if (index !== tokens.length) return null;
    const polygons = (match[1]!.toUpperCase() === "POLYGON" ? [parsed] : parsed) as [number, number][][][];
    if (!polygons.length || polygons.some(polygon => !Array.isArray(polygon) || !polygon.length || polygon.some(ring => !Array.isArray(ring) || ring.length < 4 || ring.some(point => !Array.isArray(point) || point.length !== 2 || point.some(n => typeof n !== "number")) || ring[0]![0] !== ring.at(-1)![0] || ring[0]![1] !== ring.at(-1)![1]))) return null;
    return { polygons };
  } catch { return null; }
}

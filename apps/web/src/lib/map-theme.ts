import type { StyleSpecification } from "maplibre-gl";
import type { Theme } from "@/theme/theme";
import { MAP_DARK_STYLE_URL, MAP_STYLE_URL } from "./constants";

export function mapStyleUrl(theme: Theme): string {
  return theme === "dark" ? MAP_DARK_STYLE_URL : MAP_STYLE_URL;
}

/** Keep live overlays from the current style, never a snapshot taken before the fetch. */
export function preserveMapOverlays(previous: StyleSpecification, next: StyleSpecification, sourceIds: readonly string[]): StyleSpecification {
  const sources = { ...next.sources };
  for (const id of sourceIds) if (previous.sources[id]) sources[id] = previous.sources[id]!;
  const overlays = previous.layers.filter((layer) => "source" in layer && sourceIds.includes(layer.source));
  const ids = new Set(overlays.map((layer) => layer.id));
  return { ...next, sources, layers: [...next.layers.filter((layer) => !ids.has(layer.id)), ...overlays] };
}

export async function fetchMapStyle(theme: Theme, signal: AbortSignal): Promise<StyleSpecification> {
  const response = await fetch(mapStyleUrl(theme), { signal });
  if (!response.ok) throw new Error(`Map style request failed: ${response.status}`);
  const value = await response.json() as StyleSpecification;
  if (value.version !== 8 || !value.sources || !Array.isArray(value.layers)) throw new Error("Invalid map style");
  return value;
}

import type { StyleSpecification } from "maplibre-gl";
import type { Theme } from "@/theme/theme";
import { MAP_DARK_STYLE_URL, MAP_STYLE_URL } from "./constants";

export function mapStyleUrl(theme: Theme): string {
  return theme === "dark" ? MAP_DARK_STYLE_URL : MAP_STYLE_URL;
}

/** A slate basemap with visible streets, buildings and labels, retaining provider geometry. */
export function readableMapStyle(style: StyleSpecification, theme: Theme): StyleSpecification {
  if (theme !== "dark") return style;
  return { ...style, layers: style.layers.map((layer) => {
    if (layer.type === "background") return { ...layer, paint: { ...layer.paint, "background-color": "#303938" } };
    if (layer.type === "fill") {
      const colors: Record<string, string> = {
        water: "#223e4c", landcover_ice_shelf: "#667772", landcover_glacier: "#667772",
        landuse_residential: "#404946", landcover_wood: "#3b5042", landuse_park: "#3b5042",
        building: "#59665f", "aeroway-area": "#505c57", road_area_pier: "#68756d",
      };
      const color = colors[layer.id];
      if (!color) return layer;
      const paint = { ...layer.paint, "fill-color": color };
      // The provider's black woodland pattern otherwise hides the new fill colour.
      if (layer.id === "landcover_wood") delete paint["fill-pattern"];
      if (layer.id === "building") paint["fill-outline-color"] = "#7e8b81";
      return { ...layer, paint };
    }
    if (layer.type === "line") {
      let color: string | undefined;
      if (layer.id === "waterway") color = "#537d91";
      else if (layer.id.startsWith("highway_") || layer.id.startsWith("aeroway-")) {
        color = layer.id.endsWith("casing") ? "#424e48"
          : layer.id.includes("motorway") ? "#c9b98f"
          : layer.id.includes("major") ? "#a7b1a4" : "#84958b";
      } else if (layer.id.startsWith("railway")) color = layer.id.endsWith("dashline") ? "#303938" : "#97a49b";
      else if (layer.id.startsWith("boundary_")) color = "#89988f";
      else if (layer.id === "road_pier") color = "#89988f";
      return color ? { ...layer, paint: { ...layer.paint, "line-color": color } } : layer;
    }
    if (layer.type === "symbol" && layer.layout?.["text-field"]) {
      return { ...layer, paint: { ...layer.paint,
        "text-color": layer.id === "water_name" ? "#c0dce8" : "#e6ece4",
        "text-halo-color": "#29332f", "text-halo-width": 1.5, "text-halo-blur": 0.5,
      } };
    }
    return layer;
  }) };
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
  return readableMapStyle(value, theme);
}

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Theme } from "@/theme/theme";
import { fetchMapStyle, preserveMapOverlays } from "./map-theme";

const NO_OVERLAYS: readonly string[] = [];

/** Swap the basemap in place, retaining its camera, DOM markers and live overlay data. */
export function useMapStyleTheme(mapRef: RefObject<MapLibreMap | null>, ready: boolean, theme: Theme, sourceIds: readonly string[] = NO_OVERLAYS) {
  const currentTheme = useRef(theme);
  const [appliedTheme, setAppliedTheme] = useState(theme);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (currentTheme.current === theme) { setChanging(false); setError(false); return; }
    const controller = new AbortController();
    let rejected = false;
    setChanging(true);
    setError(false);
    const settled = () => {
      if (!controller.signal.aborted && mapRef.current === map) setChanging(false);
      map.off("error", failed);
    };
    const failed = () => {
      rejected = true;
      if (controller.signal.aborted || mapRef.current !== map) return;
      setError(true);
      setChanging(false);
    };
    fetchMapStyle(theme, controller.signal).then((next) => {
      if (controller.signal.aborted || mapRef.current !== map) return;
      // Fetch outside MapLibre: its URL-based style diff cannot abort older requests.
      const style = preserveMapOverlays(map.getStyle(), next, sourceIds);
      map.once("idle", settled);
      map.on("error", failed);
      map.setStyle(style);
      // MapLibre reports semantic validation failures as events rather than throws.
      if (rejected) throw new Error("Map style was rejected");
      currentTheme.current = theme;
      setAppliedTheme(theme);
    }).catch(() => {
      if (controller.signal.aborted || mapRef.current !== map) return;
      setError(true);
      setChanging(false);
      map.off("error", failed);
      map.off("idle", settled);
    });
    return () => { controller.abort(); map.off("idle", settled); map.off("error", failed); };
  }, [mapRef, ready, theme, sourceIds]);

  return { appliedTheme, changing, error };
}

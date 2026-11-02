import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { HouseSearchEntry } from "@shared/types/house-search";
import { useI18n } from "@/i18n/i18n";
import { formatDkk } from "@/lib/house-search-format";
import { entryBounds, toFeatureCollection, type HeatmapWeight, type HeatPointProperties } from "@/lib/house-search-heatmap";
import { mapStyleUrl, readableMapStyle } from "@/lib/map-theme";
import { useMapStyleTheme } from "@/lib/use-map-style-theme";
import { useTheme } from "@/theme/theme";
import type { TranslationKey } from "@/i18n/translations";

const SOURCE = "house-search";
const HEAT = "house-search-heat";
const POINTS = "house-search-points";
/** Sources kept alive when the basemap theme changes (see useMapStyleTheme). */
const OVERLAY_SOURCES: readonly string[] = [SOURCE];
/** Below this many located listings a kernel-density heatmap mostly shows chance clusters. */
export const FEW_POINTS = 15;

export type MapView = "heat" | "pins";

const STATUS_COLORS = { interested: "#3b82f6", visited: "#16a34a", rejected: "#94a3b8" } as const;
const FADE_IN: maplibregl.ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 12, 0, 14, 1];

function applyView(map: maplibregl.Map, view: MapView) {
  if (!map.getLayer(HEAT) || !map.getLayer(POINTS)) return;
  map.setLayoutProperty(HEAT, "visibility", view === "heat" ? "visible" : "none");
  // Heat view: points fade in as you zoom past the heat. Pins view: always visible.
  map.setPaintProperty(POINTS, "circle-opacity", view === "heat" ? FADE_IN : 1);
  map.setPaintProperty(POINTS, "circle-stroke-opacity", view === "heat" ? FADE_IN : 1);
}

function addOverlay(map: maplibregl.Map) {
  map.addSource(SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: HEAT,
    type: "heatmap",
    source: SOURCE,
    paint: {
      "heatmap-weight": ["get", "weight"],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 14, 1.6],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 14, 12, 28, 15, 50],
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(59,130,246,0)",
        0.2, "rgba(59,130,246,0.45)",
        0.4, "rgba(34,197,94,0.6)",
        0.6, "rgba(250,204,21,0.75)",
        0.8, "rgba(249,115,22,0.85)",
        1, "rgba(220,38,38,0.9)",
      ],
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.9, 16, 0.35],
    },
  });
  map.addLayer({
    id: POINTS,
    type: "circle",
    source: SOURCE,
    paint: {
      "circle-radius": 7,
      "circle-color": ["match", ["get", "status"], "visited", STATUS_COLORS.visited, "rejected", STATUS_COLORS.rejected, STATUS_COLORS.interested],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
}

const segment = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${active ? "border-cta bg-cta text-cta-text" : "border-border-strong bg-surface text-ink hover:bg-surface-hover"}`;

/** Heatmap (or pins) of the listings that have a location, over the app's basemap. */
export function HeatmapMap({ entries }: { entries: HouseSearchEntry[] }) {
  const { t, language } = useI18n();
  const { theme } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<HeatmapWeight>("count");
  const [view, setView] = useState<MapView>("heat");
  const themeState = useMapStyleTheme(map, ready, theme, OVERLAY_SOURCES);

  const data = useMemo(() => toFeatureCollection(entries, mode), [entries, mode]);
  const located = data.features.length;
  // A string key, so panning is not undone by a re-render that merely produced a new array.
  const boundsKey = useMemo(() => entryBounds(entries)?.join(",") ?? "", [entries]);

  // Popup text is built at click time from the latest language and strings.
  const describe = useRef<(p: HeatPointProperties) => HTMLElement>(() => document.createElement("div"));
  describe.current = (p) => {
    const root = document.createElement("div");
    root.style.cssText = "font:13px/1.4 system-ui,sans-serif;color:#1e293b;max-width:220px";
    const title = document.createElement("strong");
    title.textContent = p.label; // textContent, never innerHTML: the address and notes are user input.
    root.append(title);
    const lines = [
      p.price !== null ? formatDkk(p.price, language) : null,
      p.rooms !== null ? t("hs.list.rooms", { count: p.rooms }) : null,
      p.rating !== null ? t("hs.list.rated", { rating: p.rating }) : null,
      t(`hs.status.${p.status}` as TranslationKey),
    ];
    for (const line of lines) {
      if (!line) continue;
      const div = document.createElement("div");
      div.textContent = line;
      root.append(div);
    }
    return root;
  };

  useEffect(() => {
    if (!container.current) return;
    try {
      const instance = new maplibregl.Map({ container: container.current, center: [9.9, 57.04], zoom: 8 });
      instance.setStyle(mapStyleUrl(theme), { transformStyle: (_previous, next) => readableMapStyle(next, theme) });
      instance.addControl(new maplibregl.NavigationControl(), "top-right");
      instance.on("load", () => {
        addOverlay(instance);
        setReady(true);
      });
      instance.on("click", POINTS, (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const [lon, lat] = feature.geometry.coordinates as [number, number];
        new maplibregl.Popup({ offset: 12 }).setLngLat([lon, lat]).setDOMContent(describe.current(feature.properties as HeatPointProperties)).addTo(instance);
      });
      instance.on("mouseenter", POINTS, () => { instance.getCanvas().style.cursor = "pointer"; });
      instance.on("mouseleave", POINTS, () => { instance.getCanvas().style.cursor = ""; });
      instance.on("error", () => setError(true));
      map.current = instance;
      return () => { instance.remove(); map.current = null; setReady(false); };
    } catch {
      setError(true);
    }
    // The map is created once. Theme changes go through useMapStyleTheme.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    (map.current?.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(data as never);
  }, [data, ready]);

  useEffect(() => {
    if (ready && map.current) applyView(map.current, view);
  }, [view, ready]);

  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance || !boundsKey) return;
    const [west, south, east, north] = boundsKey.split(",").map(Number) as [number, number, number, number];
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    instance.fitBounds([[west, south], [east, north]], { padding: 56, maxZoom: 14, duration: reduceMotion ? 0 : 400 });
  }, [boundsKey, ready]);

  const total = entries.length;
  return (
    <section aria-labelledby="hs-map-title" className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <h3 id="hs-map-title" className="mb-3 text-lg font-bold tracking-tight">{t("hs.map.title")}</h3>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div role="group" aria-label={t("hs.map.viewHeat")} className="flex gap-1.5">
          <button type="button" aria-pressed={view === "heat"} className={segment(view === "heat")} onClick={() => setView("heat")}>{t("hs.map.viewHeat")}</button>
          <button type="button" aria-pressed={view === "pins"} className={segment(view === "pins")} onClick={() => setView("pins")}>{t("hs.map.viewPins")}</button>
        </div>
        <div role="group" aria-label={t("hs.map.title")} className="flex gap-1.5">
          <button type="button" aria-pressed={mode === "count"} className={segment(mode === "count")} onClick={() => setMode("count")}>{t("hs.map.modeCount")}</button>
          <button type="button" aria-pressed={mode === "interest"} className={segment(mode === "interest")} onClick={() => setMode("interest")}>{t("hs.map.modeInterest")}</button>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-soft">{mode === "count" ? t("hs.map.modeHelpCount") : t("hs.map.modeHelpInterest")}</p>

      <div
        ref={container}
        role="region"
        aria-label={t("hs.map.label")}
        aria-busy={!ready || themeState.changing}
        data-map-theme={themeState.appliedTheme}
        className="mt-3 h-[26rem] overflow-hidden rounded-xl bg-surface-alt lg:h-[32rem]"
      />

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft" aria-hidden="true">
        {(["interested", "visited", "rejected"] as const).map((status) => (
          <li key={status} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-white" style={{ background: STATUS_COLORS[status] }} />
            {t(`hs.status.${status}` as TranslationKey)}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-ink-soft" aria-live="polite">{t("hs.map.onMap", { located, total })}</p>
      {view === "heat" && located > 0 && located < FEW_POINTS && <p className="mt-1 text-xs text-warning">{t("hs.map.fewPoints", { min: FEW_POINTS })}</p>}
      {(error || themeState.error) && <p role="alert" className="mt-2 text-xs text-warning">{error ? t("hs.map.error") : t("hs.map.themeError")}</p>}
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./property-map.css";
import type { Property, PropertyFilters } from "@shared/types/index";
import { parseSearchBoundary, searchBoundaryBbox, serializeSearchBoundary, type SearchBoundaryPoint } from "@shared/utils/search-boundary";
import { DENMARK_BOUNDS, MAP_VIEWPORT_LIMIT } from "@/lib/constants";
import { searchProperties } from "@/lib/api";
import { boundaryMapData, mapPriceLabel, propertyMapData, validMapProperty, viewportSearchBoundary } from "@/lib/property-map-data";
import { useI18n, type TranslateFn } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import { useTheme, type Theme } from "@/theme/theme";
import { mapStyleUrl } from "@/lib/map-theme";
import { useMapStyleTheme } from "@/lib/use-map-style-theme";

interface PropertyMapProps {
  properties: Property[];
  /** Omit filters for a fixed property-detail map. */
  filters?: PropertyFilters;
  onSelect?: (property: Property) => void;
  onBoundaryChange?: (polygon: string | null) => void;
}

const BOUNDARY_SOURCE = "search-boundary";
const PROPERTY_SOURCE = "search-properties";
const CLUSTER_LAYER = "property-clusters";
const POINT_LAYER = "property-points";
const MAP_BOUNDARY = "#97603a";
const MAP_CLUSTER = "#20221f";
const OVERLAY_SOURCES = [BOUNDARY_SOURCE, PROPERTY_SOURCE];

function applyOverlayTheme(map: maplibregl.Map, theme: Theme) {
  const dark = theme === "dark";
  if (!map.getLayer("boundary-fill")) return;
  const line = dark ? "#f2bd95" : MAP_BOUNDARY;
  map.setPaintProperty("boundary-fill", "fill-color", line);
  map.setPaintProperty("boundary-fill", "fill-opacity", ["case", ["==", ["get", "kind"], "saved"], dark ? 0.18 : 0.13, dark ? 0.12 : 0.09]);
  for (const id of ["boundary-saved-line", "boundary-draft-line"]) map.setPaintProperty(id, "line-color", line);
  map.setPaintProperty("boundary-vertices", "circle-color", dark ? "#20231f" : "#fff");
  map.setPaintProperty("boundary-vertices", "circle-stroke-color", line);
  map.setPaintProperty(CLUSTER_LAYER, "circle-color", dark ? "#f7bb8d" : MAP_CLUSTER);
  map.setPaintProperty(CLUSTER_LAYER, "circle-stroke-color", dark ? "#20231f" : "#fff");
}

function createPopupContent(property: Property, t: TranslateFn, language: "da" | "en", onNavigate: (path: string) => void) {
  const wrapper = document.createElement("div");
  wrapper.className = "min-w-[170px]";
  const type = document.createElement("span");
  type.className = "ds-mono block text-[9.5px] text-ink-soft";
  type.textContent = t(`propertyType.${property.propertyType}` as TranslationKey);
  wrapper.appendChild(type);
  const address = document.createElement("p");
  address.className = "mt-1 text-[13px] font-semibold text-ink";
  address.textContent = property.address;
  wrapper.appendChild(address);
  const price = document.createElement("p");
  price.className = "mt-1 text-[13px] font-semibold text-ink";
  price.textContent = Number.isFinite(property.price) && property.price > 0
    ? new Intl.NumberFormat(language === "da" ? "da-DK" : "en-GB", { style: "currency", currency: "DKK", maximumFractionDigits: 0 }).format(property.price)
    : mapPriceLabel(property.price, language);
  wrapper.appendChild(price);
  const path = `/property/${property.id}`;
  const link = document.createElement("a");
  link.href = path;
  link.className = "mt-2 inline-block text-[12px] font-semibold text-brand-text underline underline-offset-2";
  link.textContent = t("property.viewListing");
  link.addEventListener("click", (event) => { event.preventDefault(); onNavigate(path); });
  wrapper.appendChild(link);
  return wrapper;
}

function installLayers(map: maplibregl.Map) {
  map.addSource(BOUNDARY_SOURCE, { type: "geojson", data: boundaryMapData(null, []) });
  map.addLayer({ id: "boundary-fill", type: "fill", source: BOUNDARY_SOURCE, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": MAP_BOUNDARY, "fill-opacity": ["case", ["==", ["get", "kind"], "saved"], 0.13, 0.09] } });
  map.addLayer({ id: "boundary-saved-line", type: "line", source: BOUNDARY_SOURCE, filter: ["==", ["get", "kind"], "saved"], paint: { "line-color": MAP_BOUNDARY, "line-width": 3 } });
  map.addLayer({ id: "boundary-draft-line", type: "line", source: BOUNDARY_SOURCE, filter: ["in", ["get", "kind"], ["literal", ["draft-line", "draft-fill"]]], paint: { "line-color": MAP_BOUNDARY, "line-width": 3, "line-dasharray": [2, 1.5] } });
  map.addLayer({ id: "boundary-vertices", type: "circle", source: BOUNDARY_SOURCE, filter: ["==", ["get", "kind"], "vertex"], paint: { "circle-radius": 6, "circle-color": "#fff", "circle-stroke-color": MAP_BOUNDARY, "circle-stroke-width": 3 } });
  map.addSource(PROPERTY_SOURCE, { type: "geojson", data: propertyMapData([]), cluster: true, clusterMaxZoom: 15, clusterRadius: 54 });
  map.addLayer({ id: CLUSTER_LAYER, type: "circle", source: PROPERTY_SOURCE, filter: ["has", "point_count"], paint: { "circle-color": MAP_CLUSTER, "circle-radius": ["step", ["get", "point_count"], 20, 25, 24, 100, 28], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
  // Invisible hit geometry tells us which unclustered price pills are actually visible.
  map.addLayer({ id: POINT_LAYER, type: "circle", source: PROPERTY_SOURCE, filter: ["!", ["has", "point_count"]], paint: { "circle-radius": 1, "circle-opacity": 0 } });
}

export function PropertyMap({ properties, filters, onSelect, onBoundaryChange }: PropertyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawButtonRef = useRef<HTMLButtonElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef(new Map<string, maplibregl.Marker>());
  const drawingRef = useRef(false);
  const draftRef = useRef<SearchBoundaryPoint[]>([]);
  const cameraSetRef = useRef(false);
  const detailPropertyRef = useRef<string | null>(null);
  const locationKey = JSON.stringify([filters?.location, filters?.postnummer]);
  const fittedLocationRef = useRef(locationKey);
  const { t, language } = useI18n();
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const navigate = useNavigate();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [searching, setSearching] = useState(false);
  const [viewportTotal, setViewportTotal] = useState<number | null>(null);
  const [displayedProperties, setDisplayedProperties] = useState(properties);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<SearchBoundaryPoint[]>([]);
  const [drawError, setDrawError] = useState<"invalid" | "limit" | "viewport" | null>(null);
  const canDraw = Boolean(filters && onBoundaryChange);
  const polygon = filters?.polygon ?? null;
  const polygonRef = useRef(polygon);
  const displayedPropertiesRef = useRef(displayedProperties);
  polygonRef.current = polygon;
  displayedPropertiesRef.current = displayedProperties;
  const filterKey = JSON.stringify(filters ? Object.entries(filters).sort(([left], [right]) => left.localeCompare(right)) : null);
  const invalidSavedBoundary = polygon !== null && !parseSearchBoundary(polygon);
  const mappedCount = new Set(displayedProperties.filter(validMapProperty).map((property) => property.id)).size;
  drawingRef.current = drawing;
  draftRef.current = draft;

  useEffect(() => {
    if (!containerRef.current) return;
    let map: maplibregl.Map;
    const initialBoundary = searchBoundaryBbox(polygon);
    try {
      map = new maplibregl.Map({
        container: containerRef.current, style: mapStyleUrl(theme), renderWorldCopies: false,
        bounds: initialBoundary ? [[initialBoundary[0], initialBoundary[1]], [initialBoundary[2], initialBoundary[3]]] : DENMARK_BOUNDS,
        fitBoundsOptions: { padding: 48 },
      });
    } catch { setMapError(true); return; }
    mapRef.current = map;
    cameraSetRef.current = Boolean(initialBoundary);
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.on("load", () => {
      installLayers(map);
      applyOverlayTheme(map, themeRef.current);
      setReady(true);
      map.getCanvas().setAttribute("aria-label", language === "da" ? "Boligkort. Brug piletasterne til at flytte kortet." : "Property map. Use arrow keys to move the map.");
    });
    map.on("style.load", () => {
      applyOverlayTheme(map, themeRef.current);
      (map.getSource(BOUNDARY_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(boundaryMapData(parseSearchBoundary(polygonRef.current), draftRef.current));
      (map.getSource(PROPERTY_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(propertyMapData(displayedPropertiesRef.current));
    });
    map.on("error", () => setMapError(true));
    map.on("movestart", (event) => { if (event.originalEvent) cameraSetRef.current = true; });
    map.on("click", (event) => {
      if (!drawingRef.current || event.originalEvent.detail > 1) return;
      const point: SearchBoundaryPoint = [event.lngLat.wrap().lng, event.lngLat.lat];
      const current = draftRef.current;
      if (current.length >= 64) { setDrawError("limit"); return; }
      const last = current.at(-1);
      if (last && Math.abs(last[0] - point[0]) < 1e-7 && Math.abs(last[1] - point[1]) < 1e-7) return;
      setDrawError(null);
      draftRef.current = [...current, point];
      setDraft(draftRef.current);
    });
    map.on("click", CLUSTER_LAYER, (event) => {
      if (drawingRef.current) return;
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      const center = feature.geometry.coordinates as [number, number];
      const source = map.getSource(PROPERTY_SOURCE) as maplibregl.GeoJSONSource;
      source.getClusterExpansionZoom(Number(feature.properties.cluster_id)).then((zoom) => {
        if (mapRef.current === map && !drawingRef.current) map.easeTo({ center, zoom });
      }).catch(() => { /* A newer viewport response may have replaced this cluster. */ });
    });
    map.on("mouseenter", CLUSTER_LAYER, () => { if (!drawingRef.current) map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", CLUSTER_LAYER, () => { map.getCanvas().style.cursor = drawingRef.current ? "crosshair" : ""; });
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      mapRef.current = null;
      map.remove();
      setReady(false);
    };
    // The map is created once. Later filters change sources, never the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mapStyleTheme = useMapStyleTheme(mapRef, ready, theme, OVERLAY_SOURCES);
  const wasChangingTheme = useRef(false);
  useEffect(() => {
    if (wasChangingTheme.current && ready && !mapStyleTheme.changing && !mapStyleTheme.error) setMapError(false);
    wasChangingTheme.current = mapStyleTheme.changing;
    // Only a completed recovery clears an old warning; later tile errors stay visible.
  }, [ready, mapStyleTheme.changing, mapStyleTheme.error]);
  useEffect(() => {
    if (ready && mapRef.current) applyOverlayTheme(mapRef.current, theme);
  }, [ready, theme]);

  useEffect(() => {
    // Search maps use the viewport response. Detail maps use their supplied properties.
    if (!filters) setDisplayedProperties(properties);
    const map = mapRef.current;
    const valid = properties.filter(validMapProperty);
    if (fittedLocationRef.current !== locationKey) {
      fittedLocationRef.current = locationKey;
      if (polygon === null) cameraSetRef.current = false;
    }
    if (!map || !ready || valid.length === 0) return;
    if (filters ? cameraSetRef.current : detailPropertyRef.current === valid.map((property) => property.id).join(",")) return;
    cameraSetRef.current = true;
    detailPropertyRef.current = valid.map((property) => property.id).join(",");
    if (valid.length === 1) map.jumpTo({ center: [valid[0]!.lon, valid[0]!.lat], zoom: 15 });
    else {
      const bounds = new maplibregl.LngLatBounds();
      valid.forEach((property) => bounds.extend([property.lon, property.lat]));
      map.fitBounds(bounds, { padding: 64, maxZoom: 14, duration: 0 });
    }
  }, [properties, ready, filters, locationKey, polygon]);

  useEffect(() => {
    // Never carry results from another filter/area into this search, even while the map loads.
    if (filters) { setDisplayedProperties([]); setViewportTotal(null); setSearchError(false); }
    const map = mapRef.current;
    if (!map || !ready || !filters) return;
    let alive = true;
    let requestId = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refetchViewport = () => {
      const id = ++requestId;
      const bounds = map.getBounds();
      const bbox = [Math.max(-180, bounds.getWest()), Math.max(-90, bounds.getSouth()), Math.min(180, bounds.getEast()), Math.min(90, bounds.getNorth())].join(",");
      setSearching(true);
      searchProperties({ ...filters, bbox, limit: MAP_VIEWPORT_LIMIT, offset: 0 })
        .then((result) => {
          if (!alive || id !== requestId) return;
          setDisplayedProperties(result.properties);
          setViewportTotal(result.total);
          setSearchError(false);
        })
        .catch(() => {
          if (alive && id === requestId) { setSearchError(true); setDisplayedProperties([]); setViewportTotal(null); }
        })
        .finally(() => { if (alive && id === requestId) setSearching(false); });
    };
    const schedule = () => {
      // Invalidate immediately, so an older response cannot land during the debounce.
      requestId += 1;
      clearTimeout(timer);
      timer = setTimeout(refetchViewport, 160);
    };
    map.on("moveend", schedule);
    refetchViewport();
    return () => { alive = false; clearTimeout(timer); map.off("moveend", schedule); };
    // Equivalent filter objects must not restart requests or clear results.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource(BOUNDARY_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(boundaryMapData(parseSearchBoundary(polygon), draft));
  }, [polygon, draft, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource(PROPERTY_SOURCE) as maplibregl.GeoJSONSource;
    const byId = new Map(displayedProperties.filter(validMapProperty).map((property) => [property.id, property]));
    const markers = markersRef.current;
    markers.forEach((marker) => marker.remove());
    markers.clear();
    source?.setData(propertyMapData(displayedProperties));
    let alive = true;
    const syncMarkers = () => {
      if (!alive || !map.getSource(PROPERTY_SOURCE) || !map.getLayer(POINT_LAYER) || !map.getLayer(CLUSTER_LAYER) || !map.isSourceLoaded(PROPERTY_SOURCE)) return;
      const visible = new Set<string>();
      map.queryRenderedFeatures(undefined, { layers: [POINT_LAYER, CLUSTER_LAYER] }).forEach((feature) => {
        if (feature.properties.cluster && feature.geometry.type === "Point") {
          const id = `cluster:${feature.properties.cluster_id}`;
          visible.add(id);
          if (markers.has(id)) return;
          const button = document.createElement("button");
          button.type = "button";
          button.className = "property-map-cluster";
          button.textContent = String(feature.properties.point_count_abbreviated);
          button.tabIndex = drawingRef.current ? -1 : 0;
          button.style.pointerEvents = drawingRef.current ? "none" : "auto";
          const center = feature.geometry.coordinates as [number, number];
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            if (drawingRef.current) return;
            const currentSource = map.getSource(PROPERTY_SOURCE) as maplibregl.GeoJSONSource | undefined;
            currentSource?.getClusterExpansionZoom(Number(feature.properties.cluster_id)).then((zoom) => {
              if (alive && !drawingRef.current) map.easeTo({ center, zoom });
            }).catch(() => { /* This cluster was replaced by a newer response. */ });
          });
          markers.set(id, new maplibregl.Marker({ element: button, anchor: "center" }).setLngLat(center).addTo(map));
          // Marker.addTo installs a generic label; apply the meaningful label afterwards.
          button.setAttribute("aria-label", language === "da" ? `Zoom ind på ${feature.properties.point_count} boliger` : `Zoom in on ${feature.properties.point_count} listings`);
          return;
        }
        const id = String(feature.properties.propertyId);
        const property = byId.get(id);
        if (!property || visible.has(id)) return;
        visible.add(id);
        if (markers.has(id)) return;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "property-map-price";
        button.textContent = mapPriceLabel(property.price, language);
        const accessiblePrice = Number.isFinite(property.price) && property.price > 0
          ? new Intl.NumberFormat(language === "da" ? "da-DK" : "en-GB", { style: "currency", currency: "DKK", maximumFractionDigits: 0 }).format(property.price)
          : mapPriceLabel(property.price, language);
        button.tabIndex = drawingRef.current ? -1 : 0;
        button.style.pointerEvents = drawingRef.current ? "none" : "auto";
        // MapLibre handles Enter/Space for its popup. Prevent the native button's
        // additional synthesized click from toggling that same popup closed again.
        button.addEventListener("keypress", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!drawingRef.current) onSelect?.(property);
          }
        });
        const popup = new maplibregl.Popup({ offset: 20, maxWidth: "270px" }).setDOMContent(createPopupContent(property, t, language, navigate));
        const marker = new maplibregl.Marker({ element: button, anchor: "center" }).setLngLat([property.lon, property.lat]).setPopup(popup).addTo(map);
        button.setAttribute("aria-label", `${property.address}, ${accessiblePrice}`);
        button.addEventListener("click", () => { if (!drawingRef.current) onSelect?.(property); });
        markers.set(id, marker);
      });
      for (const [id, marker] of markers) if (!visible.has(id)) { marker.remove(); markers.delete(id); }
    };
    map.on("render", syncMarkers);
    syncMarkers();
    return () => {
      alive = false;
      map.off("render", syncMarkers);
      markers.forEach((marker) => marker.remove());
      markers.clear();
    };
  }, [displayedProperties, ready, language, t, navigate, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.getCanvas().style.cursor = drawing ? "crosshair" : "";
    markersRef.current.forEach((marker) => {
      marker.getElement().style.pointerEvents = drawing ? "none" : "auto";
      marker.getElement().tabIndex = drawing ? -1 : 0;
      if (drawing) marker.getPopup()?.remove();
    });
    if (!drawing) return;
    const doubleClickEnabled = map.doubleClickZoom.isEnabled();
    map.doubleClickZoom.disable();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setDrawing(false); setDraft([]); setDrawError(null);
      requestAnimationFrame(() => drawButtonRef.current?.focus());
    };
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("keydown", escape);
      if (doubleClickEnabled && mapRef.current === map) map.doubleClickZoom.enable();
    };
  }, [drawing, ready]);

  const cancelDrawing = () => {
    setDrawing(false); setDraft([]); setDrawError(null);
    requestAnimationFrame(() => drawButtonRef.current?.focus());
  };
  const finishDrawing = () => {
    const valid = parseSearchBoundary(draft);
    if (!valid) { setDrawError("invalid"); return; }
    onBoundaryChange?.(serializeSearchBoundary(valid));
    cancelDrawing();
  };
  const useViewport = () => {
    const bounds = mapRef.current?.getBounds();
    if (!bounds) return;
    const rectangle = viewportSearchBoundary(bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth());
    if (!rectangle) { setDrawError("viewport"); return; }
    onBoundaryChange?.(serializeSearchBoundary(rectangle));
    cancelDrawing();
  };

  return <div data-map-theme={mapStyleTheme.appliedTheme} aria-busy={!ready || mapStyleTheme.changing} className={`property-map relative h-full min-h-[280px] w-full overflow-hidden ${filters ? "rounded-none" : "rounded-2xl"}`}>
    <div ref={containerRef} className="h-full w-full" />
    {canDraw && <div className="property-map-panel absolute left-3 top-3 z-10 max-w-[calc(100%-68px)] rounded-xl p-2 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        {!drawing ? <>
          <button ref={drawButtonRef} type="button" className="property-map-control property-map-primary" disabled={!ready} onClick={() => { setDraft([]); setDrawError(null); setDrawing(true); }}>{tx("Tegn område", "Draw area")}</button>
          <button type="button" className="property-map-control" disabled={!ready} onClick={useViewport}>{tx("Brug kortudsnit", "Use visible map area")}</button>
          {polygon !== null && <button type="button" className="property-map-control" onClick={() => { onBoundaryChange?.(null); cancelDrawing(); }}>{tx("Fjern område", "Remove area")}</button>}
        </> : <>
          <button type="button" className="property-map-control property-map-primary" disabled={draft.length < 3} onClick={finishDrawing}>{tx("Afslut område", "Finish area")}</button>
          <button type="button" className="property-map-control" disabled={draft.length === 0} onClick={() => { setDraft((points) => points.slice(0, -1)); setDrawError(null); }}>{tx("Fortryd punkt", "Undo point")}</button>
          <button type="button" className="property-map-control" onClick={cancelDrawing}>{tx("Annuller", "Cancel")}</button>
        </>}
      </div>
      <div aria-live="polite" aria-atomic="true" className="property-map-caption max-w-sm text-xs leading-relaxed">
        {drawing && <p className="px-1 pt-2">{tx(`Klik eller tryk på kortet: ${draft.length} punkter. Mindst 3. Afslut for at søge; Esc annullerer.`, `Click or tap the map: ${draft.length} points. At least 3. Finish to search; Esc cancels.`)}</p>}
        {drawError && <p className="property-map-error px-1 pt-2 font-medium">{drawError === "limit" ? tx("Højst 64 punkter. Fortryd et punkt for at fortsætte.", "At most 64 points. Undo a point to continue.") : drawError === "viewport" ? tx("Zoom ind, så kortudsnittet er et gyldigt område.", "Zoom in so the visible map forms a valid area.") : tx("Området skal have mindst 3 forskellige punkter uden krydsende linjer. Ret punkterne og prøv igen.", "The area needs at least 3 distinct points without crossing lines. Adjust the points and try again.")}</p>}
        {invalidSavedBoundary && <p className="property-map-error px-1 pt-2 font-medium">{tx("Området i linket er ugyldigt. Tegn et nyt område eller fjern det.", "The area in this link is invalid. Draw a new area or remove it.")}</p>}
      </div>
    </div>}
    {!ready && <div role="status" className="property-map-caption pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm"><span className="property-map-panel rounded-lg px-4 py-3">{mapError ? tx("Kortet kunne ikke indlæses. Boligerne kan stadig ses i listen.", "The map could not load. Listings remain available in the list.") : tx("Indlæser kort…", "Loading map…")}</span></div>}
    {ready && <div aria-live="polite" className="property-map-panel property-map-caption pointer-events-none absolute bottom-7 left-3 z-10 max-w-[calc(100%-24px)] rounded-lg px-3 py-2 text-xs">
      {mapStyleTheme.changing && <p>{tx("Opdaterer korttema…", "Updating map theme…")}</p>}
      {mapStyleTheme.error && <p>{tx("Korttemaet kunne ikke indlæses fuldt. Prøv at skifte tema igen.", "The map theme could not fully load. Try switching the theme again.")}</p>}
      {mapError && <p>{tx("Nogle kortdata kunne ikke indlæses.", "Some map data could not load.")}</p>}
      {searchError ? <p>{tx("Boligerne kunne ikke opdateres. Prøv at flytte kortet eller ændre filtrene.", "Listings could not refresh. Try moving the map or changing filters.")}</p> : searching ? <p>{tx("Opdaterer boliger i kortudsnittet…", "Updating listings in this map area…")}</p> : <p>{filters && viewportTotal !== null && viewportTotal > mappedCount ? tx(`Viser ${mappedCount} af ${viewportTotal} boliger. Zoom ind for flere.`, `Showing ${mappedCount} of ${viewportTotal} listings. Zoom in for more.`) : tx(`${mappedCount} boliger på kortet`, `${mappedCount} listings on the map`)}{polygon && !invalidSavedBoundary ? tx(" · Tegnet område aktivt", " · Drawn area active") : ""}</p>}
    </div>}
  </div>;
}

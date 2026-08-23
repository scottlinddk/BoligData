import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Property, PropertyFilters } from "@shared/types/index";
import { DENMARK_BOUNDS, MAP_STYLE_URL, MAP_VIEWPORT_LIMIT } from "@/lib/constants";
import { searchProperties } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import type { TranslateFn } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";

interface PropertyMapProps {
  properties: Property[];
  /**
   * Active search filters, used to re-query the visible viewport on
   * pan/zoom (see the effect below). Omit for a fixed single-property map
   * (e.g. the property detail page) where there's no search to re-query —
   * the map then just shows `properties` as-is.
   */
  filters?: PropertyFilters;
  onSelect?: (property: Property) => void;
}

function createPopupContent(property: Property, t: TranslateFn, onNavigate: (path: string) => void) {
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

  const path = `/property/${property.id}`;
  const link = document.createElement("a");
  link.href = path;
  link.className = "mt-2 inline-block text-[12px] font-semibold text-brand-text underline underline-offset-2";
  link.textContent = t("property.viewListing");
  link.addEventListener("click", (e) => {
    e.preventDefault();
    onNavigate(path);
  });
  wrapper.appendChild(link);

  return wrapper;
}

export function PropertyMap({ properties, filters, onSelect }: PropertyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const { t } = useI18n();
  const navigate = useNavigate();

  // Listings actually drawn on the map. Starts out mirroring the list's
  // current page (`properties`) so the map isn't empty before the first
  // viewport fetch lands, then tracks whatever's visible in the current
  // viewport instead — see the "live viewport fetch" effect below. Without
  // this, zooming into a specific street (e.g. Gl. Hasseris) only ever
  // showed whichever properties happened to be on the list's current page,
  // even though many more matches existed just outside it.
  const [displayedProperties, setDisplayedProperties] = useState<Property[]>(properties);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      bounds: DENMARK_BOUNDS,
    });
    mapRef.current.addControl(new maplibregl.NavigationControl(), "top-right");

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Fit/fly the camera whenever the underlying search result set changes
  // (new filters, new sort, a new page). Deliberately does NOT depend on
  // the live viewport fetch below — that would fight the user's own
  // panning/zooming by re-centering the map every time it moves.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    setDisplayedProperties(properties);

    if (properties.length === 1) {
      map.flyTo({ center: [properties[0]!.lon, properties[0]!.lat], zoom: 15 });
    } else if (properties.length > 1) {
      const bounds = properties.reduce(
        (b, p) => b.extend([p.lon, p.lat]),
        new maplibregl.LngLatBounds([properties[0]!.lon, properties[0]!.lat], [properties[0]!.lon, properties[0]!.lat]),
      );
      map.fitBounds(bounds, { padding: 48, maxZoom: 14 });
    }
  }, [properties]);

  // Live viewport fetch: re-query listings inside the visible map area
  // whenever it settles after a pan/zoom (or the active filters change),
  // so panning/zooming into a specific street shows every matching listing
  // there instead of only whichever page the list happens to be showing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !filters) return;

    let requestId = 0;

    const refetchViewport = () => {
      const id = ++requestId;
      const bounds = map.getBounds();
      const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(",");
      searchProperties({ ...filters, bbox, limit: MAP_VIEWPORT_LIMIT, offset: 0 })
        .then((result) => {
          // Ignore a response that lost the race to a newer request (e.g. rapid zoom steps).
          if (id === requestId) setDisplayedProperties(result.properties);
        })
        .catch(() => {
          // Best-effort — keep whatever markers are already on the map.
        });
    };

    map.on("moveend", refetchViewport);
    refetchViewport();

    return () => {
      requestId = -1;
      map.off("moveend", refetchViewport);
    };
  }, [filters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const brandColor = getComputedStyle(document.documentElement).getPropertyValue("--color-brand").trim();

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = displayedProperties.map((property) => {
      const popup = new maplibregl.Popup({ offset: 16 }).setDOMContent(
        createPopupContent(property, t, navigate),
      );
      const marker = new maplibregl.Marker({ color: brandColor || "#dc4a1e" })
        .setLngLat([property.lon, property.lat])
        .setPopup(popup)
        .addTo(map);
      marker.getElement().addEventListener("click", () => onSelect?.(property));
      return marker;
    });
  }, [displayedProperties, onSelect, t, navigate]);

  return <div ref={containerRef} className="h-full w-full rounded-2xl" />;
}

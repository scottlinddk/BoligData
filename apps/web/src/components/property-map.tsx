import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Property } from "@shared/types/index";
import { DENMARK_BOUNDS, MAP_STYLE_URL } from "@/lib/constants";
import { useI18n } from "@/i18n/i18n";
import type { TranslateFn } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";

interface PropertyMapProps {
  properties: Property[];
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

export function PropertyMap({ properties, onSelect }: PropertyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const { t } = useI18n();
  const navigate = useNavigate();

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const brandColor = getComputedStyle(document.documentElement).getPropertyValue("--color-brand").trim();

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = properties.map((property) => {
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

    if (properties.length === 1) {
      map.flyTo({ center: [properties[0]!.lon, properties[0]!.lat], zoom: 15 });
    } else if (properties.length > 1) {
      const bounds = properties.reduce(
        (b, p) => b.extend([p.lon, p.lat]),
        new maplibregl.LngLatBounds([properties[0]!.lon, properties[0]!.lat], [properties[0]!.lon, properties[0]!.lat]),
      );
      map.fitBounds(bounds, { padding: 48, maxZoom: 14 });
    }
  }, [properties, onSelect, t, navigate]);

  return <div ref={containerRef} className="h-full w-full rounded-2xl" />;
}

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Property } from "@shared/types/index";
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, MAP_STYLE_URL } from "@/lib/constants";

interface PropertyMapProps {
  properties: Property[];
  onSelect?: (property: Property) => void;
}

export function PropertyMap({ properties, onSelect }: PropertyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
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
      const marker = new maplibregl.Marker({ color: brandColor || "#dc4a1e" })
        .setLngLat([property.lon, property.lat])
        .setPopup(new maplibregl.Popup({ offset: 16 }).setText(property.address))
        .addTo(map);
      marker.getElement().addEventListener("click", () => onSelect?.(property));
      return marker;
    });
  }, [properties, onSelect]);

  return <div ref={containerRef} className="h-full w-full rounded-2xl" />;
}

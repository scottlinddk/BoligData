import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Property } from "@shared/types/index";
import { DENMARK_BOUNDS, MAP_STYLE_URL } from "@/lib/constants";

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
      const marker = new maplibregl.Marker({ color: brandColor || "#dc4a1e" })
        .setLngLat([property.lon, property.lat])
        .setPopup(new maplibregl.Popup({ offset: 16 }).setText(property.address))
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
  }, [properties, onSelect]);

  return <div ref={containerRef} className="h-full w-full rounded-2xl" />;
}

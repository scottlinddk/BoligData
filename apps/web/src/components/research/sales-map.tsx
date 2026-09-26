import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ResearchAnalysisFilters, ResearchTransaction } from "@shared/analysis";
import { MAP_STYLE_URL } from "@/lib/constants";
import { buttonClass, useResearchText } from "./fields";

export function SalesMap({ rows, onFilter, onFocus }: { rows: ResearchTransaction[]; onFilter: (v: Partial<ResearchAnalysisFilters>) => void; onFocus: (id: string) => void }) {
  const tx = useResearchText(); const container = useRef<HTMLDivElement>(null); const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]); const vertices = useRef<maplibregl.Marker[]>([]);
  const drawing = useRef(false); const polygon = useRef<[number, number][]>([]);
  const [drawingState, setDrawingState] = useState(false); const [count, setCount] = useState(0); const [error, setError] = useState(false);
  const located = rows.filter(r => typeof r.lat === "number" && typeof r.lon === "number" && Number.isFinite(r.lat) && Number.isFinite(r.lon) && Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180);
  useEffect(() => {
    if (!container.current) return;
    try {
      const instance = new maplibregl.Map({ container: container.current, style: MAP_STYLE_URL, center: [9.9, 57.04], zoom: 11 });
      map.current = instance; instance.addControl(new maplibregl.NavigationControl(), "top-right");
      instance.on("click", e => { if (drawing.current) { const point: [number, number] = [e.lngLat.lng, e.lngLat.lat]; polygon.current.push(point); vertices.current.push(new maplibregl.Marker({ color: "#1f6feb" }).setLngLat(point).addTo(instance)); setCount(polygon.current.length); } });
      instance.on("error", () => setError(true));
      return () => { instance.remove(); map.current = null; };
    } catch { setError(true); }
  }, []);
  useEffect(() => {
    const instance = map.current; if (!instance) return;
    markers.current.forEach(m => m.remove());
    markers.current = located.map(r => {
      const button = document.createElement("button"); button.className = "h-4 w-4 rounded-full border-2 border-white bg-brand shadow"; button.title = r.address; button.setAttribute("aria-label", r.address);
      button.addEventListener("click", e => { if (!drawing.current) { e.stopPropagation(); onFocus(r.id); } });
      return new maplibregl.Marker({ element: button }).setLngLat([r.lon!, r.lat!]).addTo(instance);
    });
  }, [rows, onFocus]);
  const clearVertices = () => { polygon.current = []; vertices.current.forEach(m => m.remove()); vertices.current = []; setCount(0); };
  return <div className="my-4"><div className="flex flex-wrap gap-2"><button className={buttonClass} onClick={() => { const b = map.current?.getBounds(); if (b) onFilter({ bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], polygon: undefined }); }}>{tx("Brug kortudsnit", "Use map bounds")}</button><button className={buttonClass} onClick={() => { clearVertices(); drawing.current = true; setDrawingState(true); }}>{tx("Tegn område", "Draw area")}</button>{drawingState && <button disabled={count < 3} className={buttonClass} onClick={() => { onFilter({ polygon: [...polygon.current], bbox: undefined }); drawing.current = false; setDrawingState(false); }}>{tx("Brug polygon", "Use polygon")} ({count})</button>}<button className={buttonClass} onClick={() => { clearVertices(); drawing.current = false; setDrawingState(false); onFilter({ polygon: undefined, bbox: undefined }); }}>{tx("Ryd områdefilter", "Clear area filter")}</button></div>{drawingState && <p className="my-2 text-xs">{tx("Klik mindst tre hjørner på kortet, og vælg Brug polygon.", "Click at least three corners on the map, then choose Use polygon.")}</p>}<div ref={container} className="mt-3 h-72 overflow-hidden rounded-xl" />{error && <p className="mt-2 text-xs text-warning">{tx("Kortlaget kunne ikke indlæses. Tabellen viser stadig data.", "Map tiles could not load. The table still shows data.")}</p>}<p className="mt-2 text-xs text-ink-soft">{located.length}/{rows.length} {tx("handler har koordinater. Kortvalg filtrerer samme analyse.", "transactions have coordinates. Map selection filters this analysis.")}</p></div>;
}

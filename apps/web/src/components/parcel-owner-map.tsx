import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./property-map.css";
import type { ParcelMapParcel } from "@shared/types/parcel-map";
import { DEFAULT_MAP_CENTER } from "@/lib/constants";
import { mapStyleUrl, readableMapStyle } from "@/lib/map-theme";
import { useMapStyleTheme } from "@/lib/use-map-style-theme";
import { useTheme } from "@/theme/theme";
import { useI18n } from "@/i18n/i18n";
import { ApiError } from "@/lib/api";
import { useParcelOwner, useParcelsInView } from "@/hooks/use-parcel-map";

const SOURCE = "parcels", FILL = "parcels-fill", LINE = "parcels-line", LABEL = "parcels-label";
const MIN_ZOOM = 16;
const OVERLAYS = [SOURCE];

const bboxOf = (b: maplibregl.LngLatBounds) => [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(n => n.toFixed(6)).join(",");

function featureCollection(parcels: ParcelMapParcel[], selected: string | null) {
  return { type: "FeatureCollection" as const, features: parcels.map(p => ({ type: "Feature" as const, id: Number(p.id.replace(/\D/g, "")) || undefined,
    geometry: p.geometry, properties: { id: p.id, bfe: p.bfeNumber, label: p.number ?? "", selected: p.id === selected } })) };
}

/** Cadastral parcels over the basemap; click one to see its registered owner. */
export function ParcelOwnerMap() {
  const { language } = useI18n(), { theme } = useTheme();
  const da = language === "da", tx = (a: string, b: string) => (da ? a : b);
  const container = useRef<HTMLDivElement>(null), map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false), [mapError, setMapError] = useState(false);
  const [bbox, setBbox] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; bfe: string | null; number: string | null } | null>(null);
  const mapStyleTheme = useMapStyleTheme(map, ready, theme, OVERLAYS);
  const parcels = useParcelsInView(bbox);
  const owner = useParcelOwner(selected?.bfe ?? null);

  useEffect(() => {
    if (!container.current) return;
    try {
      const instance = new maplibregl.Map({ container: container.current, center: DEFAULT_MAP_CENTER, zoom: MIN_ZOOM });
      instance.setStyle(mapStyleUrl(theme), { transformStyle: (_p, next) => readableMapStyle(next, theme) });
      map.current = instance;
      instance.addControl(new maplibregl.NavigationControl(), "top-right");
      instance.on("load", () => {
        instance.addSource(SOURCE, { type: "geojson", data: featureCollection([], null) });
        instance.addLayer({ id: FILL, type: "fill", source: SOURCE, paint: { "fill-color": ["case", ["get", "selected"], "#3b82f6", "#94a3b8"], "fill-opacity": ["case", ["get", "selected"], 0.45, 0.18] } });
        instance.addLayer({ id: LINE, type: "line", source: SOURCE, paint: { "line-color": ["case", ["get", "selected"], "#dc2626", "#475569"], "line-width": ["case", ["get", "selected"], 2.5, 1] } });
        instance.addLayer({ id: LABEL, type: "symbol", source: SOURCE, minzoom: 17, layout: { "text-field": ["get", "label"], "text-size": 11, "text-font": ["Noto Sans Regular"] }, paint: { "text-color": "#1e293b", "text-halo-color": "#fff", "text-halo-width": 1.2 } });
        setReady(true);
      });
      const update = () => setBbox(instance.getZoom() >= MIN_ZOOM ? bboxOf(instance.getBounds()) : null);
      instance.on("moveend", update); instance.on("load", update);
      instance.on("click", e => {
        const hit = instance.queryRenderedFeatures(e.point, { layers: [FILL] })[0];
        setSelected(hit ? { id: String(hit.properties?.id), bfe: (hit.properties?.bfe as string | null) || null, number: (hit.properties?.label as string) || null } : null);
      });
      instance.on("mousemove", FILL, () => { instance.getCanvas().style.cursor = "pointer"; });
      instance.on("mouseleave", FILL, () => { instance.getCanvas().style.cursor = ""; });
      instance.on("error", () => setMapError(true));
      return () => { instance.remove(); map.current = null; };
    } catch { setMapError(true); }
  }, []);

  useEffect(() => {
    const source = map.current?.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined;
    source?.setData(featureCollection(parcels.data?.parcels ?? [], selected?.id ?? null) as never);
  }, [parcels.data, selected, ready]);

  const limited = owner.error instanceof ApiError && owner.error.status === 429;
  return <div className="relative h-[calc(100dvh-72px)] min-h-[480px] w-full">
    <div ref={container} data-map-theme={mapStyleTheme.appliedTheme} aria-busy={!ready} className="absolute inset-0" />
    <div className="pointer-events-none absolute left-3 top-3 max-w-[calc(100%-5rem)] space-y-2 sm:max-w-sm">
      {!bbox && ready && <p role="status" className="pointer-events-auto rounded-lg bg-surface px-3 py-2 text-xs text-ink shadow-card">{tx("Zoom ind for at se matrikler og ejere.", "Zoom in to see parcels and owners.")}</p>}
      {parcels.data?.source === "mock" && <p role="status" className="pointer-events-auto rounded-lg bg-surface px-3 py-2 text-xs text-warning shadow-card">{tx("Demodata: matriklerne er opdigtede og har ingen ejere.", "Demo data: these parcels are fictitious and have no owners.")}</p>}
      {parcels.data?.status === "unavailable" && <p role="alert" className="pointer-events-auto rounded-lg bg-surface px-3 py-2 text-xs text-warning shadow-card">{tx("Matrikelkortet er midlertidigt utilgængeligt.", "The cadastral layer is temporarily unavailable.")}</p>}
      {parcels.data?.truncated && <p className="pointer-events-auto rounded-lg bg-surface px-3 py-2 text-xs text-ink-soft shadow-card">{tx("Zoom ind – kun en del af matriklerne vises.", "Zoom in – only some parcels are shown.")}</p>}
      {(mapError || mapStyleTheme.error) && <p role="alert" className="pointer-events-auto rounded-lg bg-surface px-3 py-2 text-xs text-warning shadow-card">{tx("Kortlaget kunne ikke indlæses fuldt.", "The basemap could not fully load.")}</p>}
    </div>
    {selected && <aside aria-live="polite" className="absolute bottom-3 left-3 right-3 rounded-xl border border-border bg-surface p-4 shadow-card sm:left-3 sm:right-auto sm:w-80">
      <div className="flex items-start justify-between gap-3">
        <div><p className="ds-mono text-[10px] text-ink-soft">{tx("Matrikel", "Parcel")}</p><p className="text-sm font-semibold text-ink">{selected.number ?? "–"}{selected.bfe && <span className="ml-2 font-normal text-ink-soft">BFE {selected.bfe}</span>}</p></div>
        <button type="button" onClick={() => setSelected(null)} aria-label={tx("Luk", "Close")} className="rounded-full px-2 text-ink-soft hover:bg-surface-alt">×</button>
      </div>
      <div className="mt-3 text-sm text-ink">
        {!selected.bfe ? <p className="text-ink-soft">{tx("Ingen ejendom knyttet til matriklen.", "No land property is linked to this parcel.")}</p>
          : owner.isPending ? <p role="status" className="text-ink-soft">{tx("Henter ejer…", "Loading owner…")}</p>
          : limited ? <p role="alert" className="text-warning">{tx("Grænsen for registeropslag er nået. Prøv igen om lidt.", "Register lookup limit reached. Try again later.")}</p>
          : owner.isError ? <p role="alert" className="text-warning">{tx("Ejeren kunne ikke hentes.", "The owner could not be loaded.")}</p>
          : owner.data.reason === "condominium_parent" ? <p className="text-ink-soft">{tx("Opdelt i ejerlejligheder – ejerne er knyttet til de enkelte lejligheder.", "Divided into condominiums – owners belong to the individual units.")}</p>
          : owner.data.status !== "available" ? <p className="text-ink-soft">{owner.data.status === "not_found" ? tx("Ingen registreret ejer.", "No registered owner.") : tx("Ejeroplysninger er ikke tilgængelige.", "Owner details are unavailable.")}</p>
          : <ul className="space-y-2">{owner.data.owners.map((o, i) => <li key={i}>
              <span className="font-medium">{o.protected ? tx("Navne- og adressebeskyttet", "Name and address protected") : o.name ?? "–"}</span>
              {o.companyNumber && <span className="ml-2 text-xs text-ink-soft">CVR {o.companyNumber}</span>}
              {(o.actualShare ?? o.registeredShare) && <span className="ml-2 text-xs text-ink-soft">{o.actualShare ?? o.registeredShare}</span>}
              {o.takeoverDate && <span className="block text-xs text-ink-soft">{tx("Overtaget", "Taken over")} {o.takeoverDate}</span>}
            </li>)}</ul>}
      </div>
      <p className="mt-3 text-[11px] leading-4 text-ink-soft">{tx("Kilde: Matriklen / Geodatastyrelsen. Hvert opslag tæller med i din timegrænse.", "Source: Matriklen / Geodatastyrelsen. Each lookup counts toward your hourly limit.")}</p>
    </aside>}
  </div>;
}

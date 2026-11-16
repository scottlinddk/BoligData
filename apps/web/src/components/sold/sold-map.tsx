import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useI18n } from "@/i18n/i18n";
import { DEFAULT_MAP_CENTER } from "@/lib/constants";
import { mapStyleUrl, readableMapStyle } from "@/lib/map-theme";
import { useMapStyleTheme } from "@/lib/use-map-style-theme";
import { useTheme } from "@/theme/theme";
import { makeSoldFormat } from "@/lib/sold-format";
import { geocodeAll, readCache, writeCache, type LatLon } from "@/lib/sold-geocode";
import { SOLD_METRICS, metricValue, type SoldMetric, type SoldRow } from "@/lib/sold-stats";
import { RAMP, buildSurface, colorDomain, rampExpression } from "@/lib/sold-surface";

const SURFACE = "sold-surface";
const POINTS_SOURCE = "sold-points";
const SURFACE_FILL = "sold-surface-fill";
const PINS_MISSING = "sold-pins-missing";
const PINS = "sold-pins";
const OVERLAY_SOURCES: readonly string[] = [SURFACE, POINTS_SOURCE];
/** Below this many sales with a value, a kernel-weighted surface is mostly the noise of single sales. */
export const FEW_VALUES = 15;

const segment = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${active ? "border-cta bg-cta text-cta-text" : "border-border-strong bg-surface text-ink hover:bg-surface-hover"}`;

type Located = SoldRow & { lat: number; lon: number };

const empty = { type: "FeatureCollection" as const, features: [] };

function addOverlay(map: maplibregl.Map) {
  map.addSource(SURFACE, { type: "geojson", data: empty });
  map.addSource(POINTS_SOURCE, { type: "geojson", data: empty });
  map.addLayer({
    id: SURFACE_FILL,
    type: "fill",
    source: SURFACE,
    paint: { "fill-color": "#fd8d3c", "fill-opacity": ["*", 0.72, ["get", "support"]], "fill-antialias": false },
  });
  map.addLayer({
    id: PINS_MISSING,
    type: "circle",
    source: POINTS_SOURCE,
    filter: ["==", ["get", "hasValue"], false],
    paint: { "circle-radius": 4, "circle-color": "#94a3b8", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1 },
  });
  map.addLayer({
    id: PINS,
    type: "circle",
    source: POINTS_SOURCE,
    filter: ["==", ["get", "hasValue"], true],
    paint: { "circle-radius": 7, "circle-color": "#fd8d3c", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
  });
}

/**
 * Sold houses on a map, coloured by one of three metrics. The colour layer is a kernel-weighted
 * average surface (see lib/sold-surface.ts), not a point-density heatmap, and the pins carry the same ramp.
 */
export function SoldMap({ rows, lookupAddresses, metric, onMetricChange }: {
  /** The sales to draw (already filtered). */
  rows: SoldRow[];
  /** Every address on the page, so changing a filter never triggers new lookups. */
  lookupAddresses: readonly string[];
  metric: SoldMetric;
  onMetricChange: (m: SoldMetric) => void;
}) {
  const { language } = useI18n();
  const tx = (da: string, en: string) => (language === "da" ? da : en);
  const fmt = useMemo(() => makeSoldFormat(language), [language]);
  const { theme } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [showHeat, setShowHeat] = useState(true);
  const themeState = useMapStyleTheme(map, ready, theme, OVERLAY_SOURCES);

  // --- Coordinates: looked up once per address in the browser, cached in localStorage. ---
  const [points, setPoints] = useState<Record<string, LatLon>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(0);
  const lookupDone = progress !== null && progress.done >= progress.total;

  const allAddresses = useRef(lookupAddresses);
  useEffect(() => {
    const controller = new AbortController();
    const cache = readCache();
    const batch: Record<string, LatLon> = {};
    let flush: number | undefined;
    const schedule = () => {
      if (flush !== undefined) return;
      flush = window.setTimeout(() => { flush = undefined; setPoints({ ...batch }); }, 150);
    };
    void geocodeAll(allAddresses.current, {
      cache,
      signal: controller.signal,
      onResult: (address, point) => { if (point) { batch[address] = point; schedule(); } },
      onProgress: (done, total) => setProgress({ done, total }),
    }).then(({ failed: n }) => {
      if (controller.signal.aborted) return;
      setPoints({ ...batch });
      setFailed(n);
      writeCache(cache);
    });
    return () => { controller.abort(); if (flush !== undefined) window.clearTimeout(flush); writeCache(cache); };
  }, []);

  const located = useMemo<Located[]>(() => rows.flatMap((r) => (points[r.address] ? [{ ...r, ...points[r.address]! }] : [])), [rows, points]);
  const withFigure = useMemo(() => rows.filter((r) => metricValue(r, metric) !== null).length, [rows, metric]);
  const valued = useMemo(() => located.filter((r) => metricValue(r, metric) !== null), [located, metric]);
  const domain = useMemo(() => colorDomain(valued.map((r) => metricValue(r, metric) as number)), [valued, metric]);
  const surface = useMemo(() => buildSurface(valued.map((r) => ({ lat: r.lat, lon: r.lon, value: metricValue(r, metric) as number }))), [valued, metric]);

  const pins = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: located.map((r) => {
      const value = metricValue(r, metric);
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [r.lon, r.lat] },
        properties: { id: r.id, value, hasValue: value !== null },
      };
    }),
  }), [located, metric]);

  // Popup text is built at click time from the latest rows and language.
  const rowsById = useRef(new Map<string, SoldRow>());
  rowsById.current = new Map(rows.map((r) => [r.id, r]));
  const describe = useRef<(id: string) => HTMLElement | null>(() => null);
  describe.current = (id) => {
    const row = rowsById.current.get(id);
    if (!row) return null;
    const root = document.createElement("div");
    root.style.cssText = "font:13px/1.45 system-ui,sans-serif;color:inherit;max-width:240px";
    const title = document.createElement("strong");
    title.textContent = row.address; // textContent, never innerHTML.
    root.append(title);
    const lines: Array<[string, string]> = [
      [tx("Solgt", "Sold"), `${fmt.dkk(row.soldPrice)} · ${fmt.date(row.soldDate)}`],
      [tx("Udbud", "Listing"), fmt.dkk(row.askPrice)],
      [tx("Afslag", "Discount"), fmt.discount(row.discountPct)],
      [tx("Liggetid", "On market"), fmt.days(row.daysOnMarket)],
      [tx("Areal", "Area"), `${fmt.sqm(row.areaSqm)}${row.areaUncertain ? ` (${tx("usikkert", "uncertain")})` : ""}`],
    ];
    for (const [label, value] of lines) {
      const div = document.createElement("div");
      div.textContent = `${label}: ${value}`;
      root.append(div);
    }
    if (row.outlierReason) {
      const div = document.createElement("div");
      div.style.color = "var(--color-warning)";
      div.textContent = row.outlierReason;
      root.append(div);
    }
    return root;
  };

  useEffect(() => {
    if (!container.current) return;
    try {
      const instance = new maplibregl.Map({ container: container.current, center: DEFAULT_MAP_CENTER, zoom: 11 });
      instance.setStyle(mapStyleUrl(theme), { transformStyle: (_previous, next) => readableMapStyle(next, theme) });
      instance.addControl(new maplibregl.NavigationControl(), "top-right");
      instance.on("load", () => { addOverlay(instance); setReady(true); });
      for (const layer of [PINS, PINS_MISSING]) {
        instance.on("click", layer, (event) => {
          const feature = event.features?.[0];
          if (!feature || feature.geometry.type !== "Point") return;
          const content = describe.current(String(feature.properties?.id));
          if (!content) return;
          new maplibregl.Popup({ offset: 12 }).setLngLat(feature.geometry.coordinates as [number, number]).setDOMContent(content).addTo(instance);
        });
        instance.on("mouseenter", layer, () => { instance.getCanvas().style.cursor = "pointer"; });
        instance.on("mouseleave", layer, () => { instance.getCanvas().style.cursor = ""; });
      }
      instance.on("error", () => setError(true));
      map.current = instance;
      return () => { instance.remove(); map.current = null; setReady(false); };
    } catch {
      setError(true);
    }
    // The map is created once. Theme changes go through useMapStyleTheme.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data and colours follow the metric.
  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    (instance.getSource(SURFACE) as maplibregl.GeoJSONSource | undefined)?.setData(surface as never);
    (instance.getSource(POINTS_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(pins as never);
    if (domain && instance.getLayer(SURFACE_FILL)) {
      const color = rampExpression("value", domain) as maplibregl.ExpressionSpecification;
      instance.setPaintProperty(SURFACE_FILL, "fill-color", color);
      instance.setPaintProperty(PINS, "circle-color", color);
    }
  }, [surface, pins, domain, ready]);

  useEffect(() => {
    const instance = map.current;
    if (ready && instance?.getLayer(SURFACE_FILL)) instance.setLayoutProperty(SURFACE_FILL, "visibility", showHeat ? "visible" : "none");
  }, [showHeat, ready]);

  // Frame the sales once the lookup has finished (not on every arriving point, which would make the map jump).
  const lastFit = useRef("");
  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance || !lookupDone || located.length === 0) return;
    const key = String(located.length);
    if (lastFit.current === key) return;
    lastFit.current = key;
    const lons = located.map((r) => r.lon);
    const lats = located.map((r) => r.lat);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    instance.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 56, maxZoom: 15, duration: reduceMotion ? 0 : 400 });
  }, [located, lookupDone, ready]);

  const metricLabel: Record<SoldMetric, string> = {
    askPrice: tx("Opr. udbudspris", "Original listing price"),
    discountPct: tx("Afslag i procent", "Discount %"),
    daysOnMarket: tx("Liggetid", "Time on market"),
  };
  const metricHelp: Record<SoldMetric, string> = {
    askPrice: tx("Gennemsnitlig udbudspris omkring hvert punkt. Mørkere = dyrere.", "Average listing price around each point. Darker = more expensive."),
    discountPct: tx("Gennemsnitligt afslag i forhold til udbudsprisen. Mørkere = større afslag.", "Average discount against the listing price. Darker = bigger discount."),
    daysOnMarket: tx("Gennemsnitlig liggetid. Mørkere = længere tid på markedet. Kun Kærby har liggetid.", "Average time on market. Darker = longer. Only Kærby has time on market."),
  };

  return (
    <section aria-labelledby="sold-map-title" className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <h2 id="sold-map-title" className="mb-3 text-lg font-bold tracking-tight">{tx("Kort", "Map")}</h2>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div role="group" aria-label={tx("Vælg varmekort", "Choose heat map")} className="flex flex-wrap gap-1.5">
          {SOLD_METRICS.map((m) => (
            <button key={m} type="button" aria-pressed={metric === m} className={segment(metric === m)} onClick={() => onMetricChange(m)}>{metricLabel[m]}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={showHeat} onChange={(e) => setShowHeat(e.target.checked)} className="h-4 w-4" />
          {tx("Vis varmekort", "Show heat map")}
        </label>
      </div>
      <p className="mt-2 text-xs text-ink-soft">{metricHelp[metric]}</p>

      <div
        ref={container}
        role="region"
        aria-label={tx("Kort over solgte boliger", "Map of sold houses")}
        aria-busy={!ready || themeState.changing}
        data-map-theme={themeState.appliedTheme}
        className="mt-3 h-[26rem] overflow-hidden rounded-xl bg-surface-alt lg:h-[34rem]"
      />

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-soft" aria-hidden="true">
        {domain && (
          <div className="flex items-center gap-2">
            <span className="tabular-nums">{fmt.metric(metric, domain[0])}</span>
            <span className="h-2.5 w-40 rounded-full border border-border" style={{ background: `linear-gradient(to right, ${RAMP.join(",")})` }} />
            <span className="tabular-nums">{fmt.metric(metric, domain[1])}</span>
          </div>
        )}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-white" style={{ background: "#94a3b8" }} />
          {tx("Mangler tallet", "No figure")}
        </span>
      </div>

      <p className="mt-2 text-xs text-ink-soft" aria-live="polite">
        {tx(
          `${withFigure} af ${rows.length} boliger har dette tal og vises med farve. ${located.length} af ${rows.length} er placeret på kortet.`,
          `${withFigure} of ${rows.length} houses have this figure and are coloured. ${located.length} of ${rows.length} are placed on the map.`,
        )}
        {progress && !lookupDone && ` ${tx("Placerer adresser", "Locating addresses")} ${progress.done}/${progress.total}…`}
      </p>
      {domain && <p className="mt-1 text-xs text-ink-faint">{tx("Farveskalaen går fra 5. til 95. percentil, så enkelte ekstreme salg ikke fladgør kortet.", "The colour scale runs from the 5th to the 95th percentile so single extreme sales do not flatten the map.")}</p>}
      {showHeat && valued.length > 0 && valued.length < FEW_VALUES && (
        <p className="mt-1 text-xs text-warning">{tx(`Med under ${FEW_VALUES} salg med dette tal viser varmekortet mest enkeltsalg. Brug pins til enkeltadresser.`, `With fewer than ${FEW_VALUES} sales carrying this figure the heat map mostly shows single sales. Use the pins for single addresses.`)}</p>
      )}
      {lookupDone && failed > 0 && (
        <p role="alert" className="mt-1 text-xs text-warning">{tx(`${failed} adresser kunne ikke slås op lige nu og mangler på kortet. Genindlæs siden for at prøve igen.`, `${failed} addresses could not be looked up right now and are missing from the map. Reload the page to retry.`)}</p>
      )}
      {(error || themeState.error) && <p role="alert" className="mt-2 text-xs text-warning">{error ? tx("Kortet kunne ikke indlæses. Tabellen virker stadig.", "The map could not load. The table still works.") : tx("Korttemaet kunne ikke indlæses fuldt. Prøv at skifte tema igen.", "The map theme could not fully load. Try switching the theme again.")}</p>}
    </section>
  );
}

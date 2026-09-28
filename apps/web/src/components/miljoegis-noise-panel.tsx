import { useId, useState } from "react";
import type { MiljoegisNoiseReport, NoiseMetric, NoiseSource } from "@shared/types/miljoegis-noise";
import { useMiljoegisNoise } from "@/hooks/use-miljoegis-noise";
import { useI18n } from "@/i18n/i18n";

const labels = {
  da: {
    title: "Støjkort · MiljøGIS", intro: "Undersøg én støjkilde ad gangen ved annoncens kortpunkt. Resultatet gælder kun den valgte kilde og periode.",
    source: "Støjkilde", metric: "Periode", Lden: "Lden · hele døgnet", Lnight: "Lnight · nat kl. 22–07",
    urban_roads: "Veje i kortlagte byområder", state_roads: "Større statslige veje", bridge_roads: "Sund & Bælt · veje",
    railways: "Jernbaner", local_railways: "Metro, letbaner og lokalbaner", bridge_railways: "Sund & Bælt · jernbaner",
    model: "Kortlægning 2022 · Nord2000 · 1,5 m over terræn",
    definition: "Lden er et beregnet årsmiddel med tillæg for aften og nat. Lnight er årsmidlet om natten. Intervallerne er modelresultater, ikke aktuelle målinger, og kan ikke lægges sammen.",
    coverage: "Kortlægningen dækker udvalgte veje og baner. Byveje dækker kun kortlagte byområder. Fly, virksomheder og EU-kortlægningen er ikke med i dette opslag.",
    loading: "Henter den valgte støjkontur… Det kan tage op til 40 sekunder.",
    band_found: "Modelleret støjinterval ved kortpunktet", no_contour: "Ingen kontur fundet i det valgte kortlag",
    boundary: "Punktet ligger tæt på en konturgrænse · usikkert interval", overlapping_bands: "Overlappende intervaller · usikkert resultat",
    unavailable: "Kortlaget kunne ikke aflæses sikkert. Støjniveauet er ukendt.",
    missing: "Ingen kontur betyder ikke, at boligen er støjfri eller under en støjgrænse. Punktet kan ligge uden for kortlægningen eller de viste intervaller.",
    coordinates_missing: "Annoncen mangler brugbare danske kortkoordinater.", nonlive_data: "Der hentes ikke støjdata for en demoannonce.",
    upstream_unavailable: "MiljøGIS svarede ikke inden for tidsgrænsen eller er midlertidigt utilgængelig.",
    invalid_response: "Kildens data eller interval kunne ikke fortolkes sikkert. Se det officielle kort.",
    response_limit: "Kildens svar var for stort til et sikkert adresseopslag. Se det officielle kort.",
    retry: "Prøv igen", map: "Åbn det valgte lag i MiljøGIS", about: "Om støjkortlægningen", checked: "Hentet", candidates: "Mulige intervaller",
  },
  en: {
    title: "Noise maps · MiljøGIS", intro: "Explore one noise source at a time at the listing's map point. Each result applies only to the selected source and period.",
    source: "Noise source", metric: "Period", Lden: "Lden · whole day", Lnight: "Lnight · night 22:00–07:00",
    urban_roads: "Roads in mapped urban areas", state_roads: "Major state roads", bridge_roads: "Sund & Bælt · roads",
    railways: "Railways", local_railways: "Metro, light rail and local railways", bridge_railways: "Sund & Bælt · railways",
    model: "2022 mapping · Nord2000 · 1.5 m above ground",
    definition: "Lden is a modelled annual average with evening and night penalties. Lnight is the annual night average. Bands are model results, not current measurements, and cannot be added together.",
    coverage: "Mapping covers selected roads and railways. Urban roads cover mapped urban areas only. Aircraft, industry and EU mapping are outside this lookup.",
    loading: "Loading the selected noise contour… This can take up to 40 seconds.",
    band_found: "Modelled noise band at the map point", no_contour: "No contour found in the selected layer",
    boundary: "Point close to a contour boundary · uncertain band", overlapping_bands: "Overlapping bands · uncertain result",
    unavailable: "The layer could not be interpreted reliably. The noise level is unknown.",
    missing: "No contour does not establish a quiet home or noise below a limit. The point may be outside the mapped area or displayed bands.",
    coordinates_missing: "The listing has no usable Danish map coordinates.", nonlive_data: "Noise data is not loaded for a demo listing.",
    upstream_unavailable: "MiljøGIS did not respond within the time limit or is temporarily unavailable.",
    invalid_response: "The source data or band could not be safely interpreted. Consult the official map.",
    response_limit: "The source response was too large for a reliable address lookup. Consult the official map.",
    retry: "Try again", map: "Open the selected layer in MiljøGIS", about: "About the noise mapping", checked: "Retrieved", candidates: "Possible bands",
  },
};
const sources: NoiseSource[] = ["urban_roads", "state_roads", "bridge_roads", "railways", "local_railways", "bridge_railways"];

export function MiljoegisNoisePanel({ propertyId }: { propertyId: string }) {
  const { language } = useI18n();
  const [source, setSource] = useState<NoiseSource>("urban_roads");
  const [metric, setMetric] = useState<NoiseMetric>("Lden");
  const query = useMiljoegisNoise(propertyId, source, metric);
  return <MiljoegisNoiseContent language={language} source={source} metric={metric} onSourceChange={setSource} onMetricChange={setMetric}
    result={query.data} loading={query.isFetching || query.isPending} onRetry={() => { void query.refetch(); }} />;
}

export function MiljoegisNoiseContent({ language, source, metric, onSourceChange, onMetricChange, result, loading, onRetry }: {
  language: "da" | "en"; source: NoiseSource; metric: NoiseMetric;
  onSourceChange: (value: NoiseSource) => void; onMetricChange: (value: NoiseMetric) => void;
  result?: MiljoegisNoiseReport; loading: boolean; onRetry: () => void;
}) {
  const t = labels[language], id = useId();
  const layer = result?.layers.find(value => value.source === source && value.metric === metric);
  const reason = layer?.reason ?? result?.reason;
  const unavailable = !result || result.status === "unavailable" || !layer;
  const bands = layer?.bands.map(band => band.upperDb === null ? `> ${band.lowerDb} dB(A)` : `${band.lowerDb}–${band.upperDb} dB(A)`).join(" / ");
  return <section aria-label={t.title} className="rounded-2xl bg-surface-alt p-5 sm:p-7">
    <h2 className="text-xl font-medium tracking-tight">{t.title}</h2>
    <p className="mt-2 text-sm text-ink-soft">{t.intro}</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label htmlFor={`${id}-source`} className="text-sm font-medium">{t.source}
        <select id={`${id}-source`} value={source} onChange={event => onSourceChange(event.target.value as NoiseSource)}
          className="mt-2 block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-ink">
          {sources.map(value => <option key={value} value={value}>{t[value]}</option>)}
        </select>
      </label>
      <label htmlFor={`${id}-metric`} className="text-sm font-medium">{t.metric}
        <select id={`${id}-metric`} value={metric} onChange={event => onMetricChange(event.target.value as NoiseMetric)}
          className="mt-2 block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-ink">
          {(["Lden", "Lnight"] as const).map(value => <option key={value} value={value}>{t[value]}</option>)}
        </select>
      </label>
    </div>
    <p className="mt-4 text-xs text-ink-soft">{t.model}</p>
    <div className="mt-3 rounded-xl border border-border p-4 text-sm" role="status" aria-live="polite">
      {loading ? <p>{t.loading}</p> : unavailable ? <>
        <p className="font-medium">{t.unavailable}</p>
        {reason && <p className="mt-2 text-ink-soft">{t[reason]}</p>}
        {reason !== "coordinates_missing" && reason !== "nonlive_data" && <button type="button" className="mt-2 min-h-11 font-semibold underline" onClick={onRetry}>{t.retry}</button>}
      </> : <>
        <p className="font-medium">{t[layer.status]}</p>
        {bands && <p className="mt-2 text-lg font-semibold">{layer.status !== "band_found" && <span className="block text-xs font-normal">{t.candidates}</span>}{bands} · {metric}</p>}
      </>}
    </div>
    <p className="mt-3 text-xs leading-5 text-ink-soft">{t.definition}</p>
    <p className="mt-2 text-xs leading-5 text-ink-soft">{t.coverage}</p>
    {!loading && layer?.status === "no_contour" && <p className="mt-3 rounded-xl bg-warning-soft p-3 text-xs leading-5 text-warning-text">{t.missing}</p>}
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-sm">
      <a href={result?.mapUrl ?? "https://miljoegis.mim.dk/spatialmap?profile=noise"} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">{t.map} ↗</a>
      <a href="https://mst.dk/erhverv/rent-miljoe-og-sikker-forsyning/stoej/kortlaegning-af-stoej" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{t.about} ↗</a>
    </div>
    {result && <p className="mt-4 text-xs text-ink-faint">Miljøstyrelsen / MiljøGIS · {t.checked}: {result.checkedAt.slice(0, 10)}</p>}
  </section>;
}

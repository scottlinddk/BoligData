import type { LimfjordLanguage, LimfjordNoiseResult, LimfjordNoiseStatus, LimfjordScenarioId, LimfjordUnavailableReason } from "@shared/types/limfjord-noise";
import { useLimfjordNoise } from "@/hooks/use-limfjord-noise";
import { useI18n } from "@/i18n/i18n";

const labels = {
  da: {
    title: "3. Limfjordsforbindelse · mulig vejstøj",
    intro: "Se den ældre støjmodel for adressen og de aktuelle officielle støjkort.",
    loading: "Henter støjoplysninger fra Tredjekort…",
    unavailable: "Støjoplysninger kunne ikke hentes. Støjpåvirkningen er ukendt.",
    retry: "Prøv igen",
    resolved: "Adressepunkt",
    historic: "Historisk model fra 2021 · trafikprognose 2040",
    noModel: "Ingen historisk adresseberegning tilgængelig.",
    metric: "Modellerede støjintervaller · Lden, dB(A)",
    caveat: "Intervallerne er fra det oprindelige projekt og omfatter motorvejen og udvalgte veje i området. De viser hverken støjen fra motorvejen alene, en måling eller det aktuelle 2035-projekt. Der beregnes ingen præcis forskel mellem scenarierne.",
    missing: "Manglende støjkontur betyder ikke, at boligen er støjfri eller under en støjgrænse. Hørbarhed og overholdelse af støjgrænser er ukendt.",
    design: "Afstand til nærmeste vejlinje i det officielle 2025-projekt",
    distanceNote: "Afrundet til 10 m. Vejlinjerne inkluderer ramper og lokale veje; afstanden er ikke et støjniveau eller nødvendigvis afstanden til selve motorvejen.",
    current: "Aktuelle støjkort · trafik 2035",
    currentNote: "De nyere PDF-kort er endnu ikke omsat til pålidelige støjintervaller for adressen i Tredjekort. Brug de officielle kort til at undersøge det aktuelle projekt.",
    map: "Åbn adressen i Tredjekort",
    api: "Se Tredjekorts fulde adresserapport",
    sources: "Kilder gennemgået",
    checked: "Hentet",
    original: "Med projekt · oprindeligt forslag",
    reference: "Uden projekt · reference",
    variant: "Med projekt · variant",
    band_found: "Støjinterval fundet",
    no_matching_contour: "Ingen støjkontur ved adressepunktet",
    boundary: "På en konturgrænse · usikkert interval",
    overlapping_bands: "Overlappende intervaller · usikkert resultat",
    source_geometry_invalid: "Fejl i kildens geometri · intet sikkert interval",
    address_missing: "Annoncen mangler en adresse, der kan slås op.",
    address_not_found: "Adressepunktet blev ikke fundet hos kilden.",
    address_ambiguous: "Adressen har flere mulige match. Intet match er valgt.",
    address_mismatch: "Kildens adressepunkt stemmer ikke sikkert overens med annoncen.",
    upstream_unavailable: "Tredjekort eller adressetjenesten er midlertidigt utilgængelig.",
    invalid_response: "Kildens svar kunne ikke fortolkes sikkert.",
  },
  en: {
    title: "Third Limfjord connection · possible road noise",
    intro: "View the historical noise model at this address and the current official noise maps.",
    loading: "Loading noise information from Tredjekort…",
    unavailable: "Noise information could not be loaded. The noise impact is unknown.",
    retry: "Try again",
    resolved: "Address point",
    historic: "Historical 2021 model · 2040 traffic forecast",
    noModel: "No historical address calculation is available.",
    metric: "Modelled noise bands · Lden, dB(A)",
    caveat: "These bands describe the original project, including the motorway and selected surrounding roads. They do not isolate the motorway's contribution or represent measured noise or the current 2035 project. No exact difference between scenarios is calculated.",
    missing: "A missing contour does not establish a quiet home or noise below a limit. Audibility and compliance with noise limits are unknown.",
    design: "Distance to the nearest road centreline in the official 2025 design",
    distanceNote: "Rounded to 10 m. The network includes ramps and local roads; distance is not a noise level or necessarily the distance to the main motorway.",
    current: "Current noise maps · 2035 traffic",
    currentNote: "Tredjekort has not converted the newer PDF maps into reliable address-level noise bands. Consult the official maps for the current project.",
    map: "Open this address in Tredjekort",
    api: "View Tredjekort's full address report",
    sources: "Sources reviewed",
    checked: "Retrieved",
    original: "With project · original design",
    reference: "Without project · reference",
    variant: "With project · variant design",
    band_found: "Noise band found",
    no_matching_contour: "No noise contour at this address point",
    boundary: "On a contour boundary · uncertain band",
    overlapping_bands: "Overlapping bands · uncertain result",
    source_geometry_invalid: "Invalid source geometry · no reliable band",
    address_missing: "The listing has no usable address for a lookup.",
    address_not_found: "The source could not find the address point.",
    address_ambiguous: "The address has multiple possible matches. None was selected.",
    address_mismatch: "The source address point could not be safely matched to this listing.",
    upstream_unavailable: "Tredjekort or its address service is temporarily unavailable.",
    invalid_response: "The source response could not be safely interpreted.",
  },
} satisfies Record<LimfjordLanguage, Record<string | LimfjordScenarioId | LimfjordNoiseStatus | LimfjordUnavailableReason, string>>;

export function LimfjordNoisePanel({ propertyId }: { propertyId: string }) {
  const { language } = useI18n();
  const query = useLimfjordNoise(propertyId, language);
  return <LimfjordNoiseContent language={language} result={query.data} loading={query.isPending} onRetry={() => { void query.refetch(); }} />;
}

export function LimfjordNoiseContent({ language, result, loading, onRetry }: {
  language: LimfjordLanguage; result?: LimfjordNoiseResult; loading: boolean; onRetry: () => void;
}) {
  const t = labels[language];
  const report = result?.status === "available" ? result.report : null;
  return <section aria-label={t.title} className="rounded-2xl bg-surface-alt p-5 sm:p-7">
    <h2 className="text-xl font-medium tracking-tight">{t.title}</h2>
    <p className="mt-2 text-sm text-ink-soft">{t.intro}</p>
    {loading ? <p className="mt-4 text-sm" role="status">{t.loading}</p> : !report ?
      <div className="mt-4 text-sm" role="status">
        <p>{t.unavailable}</p>
        {result?.status === "unavailable" && <p className="mt-2 text-ink-soft">{t[result.reason]}</p>}
        <button type="button" className="mt-3 min-h-11 font-semibold underline" onClick={onRetry}>{t.retry}</button>
      </div> : <>
        <p className="mt-4 text-xs text-ink-soft">{t.resolved}: {report.address.text}</p>
        <h3 className="mt-5 font-semibold">{t.historic}</h3>
        <p className="mt-1 text-xs text-ink-soft">{t.metric}</p>
        {report.scenarios.length ? <dl className="mt-3 divide-y divide-border">
          {report.scenarios.map(scenario => <div key={scenario.scenario} className="grid gap-1 py-3 text-sm sm:grid-cols-2 sm:gap-4">
            <dt>{t[scenario.scenario]}</dt>
            <dd>
              <strong>{scenario.status === "band_found" && scenario.band ? scenario.band.label : t[scenario.status]}</strong>
              {(scenario.status === "boundary" || scenario.status === "overlapping_bands") && scenario.candidateBands.length > 0 &&
                <span className="mt-1 block text-xs text-ink-soft">{scenario.candidateBands.map(band => band.label).join(" / ")}</span>}
            </dd>
          </div>)}
        </dl> : <p className="mt-3 text-sm">{t.noModel}</p>}
        <p className="mt-3 text-xs leading-5 text-ink-soft">{t.caveat}</p>
        <p className="mt-3 rounded-xl bg-warning-soft p-3 text-xs leading-5 text-warning-text">{t.missing}</p>
        {report.officialDesignDistanceMeters !== null && <div className="mt-5 border-t border-border pt-4">
          <p className="text-sm">{t.design}: <strong>{report.officialDesignDistanceMeters.toLocaleString(language === "da" ? "da-DK" : "en-GB")} m</strong></p>
          <p className="mt-1 text-xs leading-5 text-ink-soft">{t.distanceNote}</p>
        </div>}
        <details className="mt-5 border-t border-border pt-4">
          <summary className="cursor-pointer text-sm font-semibold">{t.current}</summary>
          <p className="mt-3 text-xs leading-5 text-ink-soft">{t.currentNote}</p>
          <ul className="mt-3 space-y-2 text-sm">{report.officialDocuments.map(doc => <li key={doc.url}><a href={doc.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{doc.title} · PDF ↗</a></li>)}</ul>
        </details>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-sm">
          <a className="font-semibold underline underline-offset-2" href={report.mapUrl} target="_blank" rel="noopener noreferrer">{t.map} ↗</a>
          <a className="underline underline-offset-2" href={report.apiUrl} target="_blank" rel="noopener noreferrer">{t.api} ↗</a>
        </div>
        <p className="mt-4 text-xs text-ink-faint">Tredjekort / Vejdirektoratet{report.datasetReviewedAt ? ` · ${t.sources}: ${report.datasetReviewedAt}` : ""}{result ? ` · ${t.checked}: ${result.checkedAt.slice(0, 10)}` : ""}</p>
      </>}
  </section>;
}

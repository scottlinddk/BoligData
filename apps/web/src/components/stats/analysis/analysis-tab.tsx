import { useMemo, useState, type ReactNode } from "react";
import { minRelativeImprovement, type HedonicMethod, type HedonicSegment, type SegmentMethodRow } from "@shared/analysis/hedonic-results";
import {
  METHOD_ORDER,
  METHOD_SHORT,
  SEGMENT_LABEL,
  SEGMENT_NOTE,
  buildHeadline,
  fmt,
  hedonicView,
  rowFor,
  type Headline,
} from "@/lib/hedonic-view";
import { MethodBars } from "./method-bars";
import { ScatterChart } from "./scatter-chart";

const R = hedonicView.results;
const SEGMENTS: HedonicSegment[] = ["apartment", "house"];

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5 ${className}`}>{children}</div>;
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className="mb-12">
      <h2 id={`${id}-h`} className="text-xl font-semibold tracking-tight">{title}</h2>
      {intro && <p className="mt-1 max-w-3xl text-sm text-ink-soft">{intro}</p>}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

function Table({ caption, head, rows, wide = false, compact = false }: { caption: string; head: string[]; rows: ReactNode[][]; wide?: boolean; compact?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
      <table className={`w-full ${compact ? "" : wide ? "min-w-[760px]" : "min-w-[560px]"} text-right text-[13px] tabular-nums`}>
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-alt text-[11px] font-semibold text-ink-soft">
          <tr>{head.map((h, i) => <th key={h} scope="col" className={`px-3 py-2.5 ${i === 0 ? "text-left" : ""}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r} className="border-t border-border">
              {cells.map((c, i) => i === 0
                ? <th key={i} scope="row" className="px-3 py-2 text-left font-medium">{c}</th>
                : <td key={i} className="px-3 py-2">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SegmentToggle({ value, onChange }: { value: HedonicSegment; onChange: (s: HedonicSegment) => void }) {
  return (
    <div role="group" aria-label="Vælg boligsegment" className="inline-flex rounded-lg border border-border p-0.5 text-[12px]">
      {SEGMENTS.map((s) => (
        <button key={s} type="button" aria-pressed={value === s} onClick={() => onChange(s)}
          className={`min-h-8 rounded-md px-3 font-medium transition-colors ${value === s ? "bg-cta text-cta-text" : "text-ink-soft hover:bg-surface-alt"}`}>
          {SEGMENT_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

const EVIDENCE_STYLE: Record<string, string> = {
  "meget svag": "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  svag: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  moderat: "bg-surface-alt text-ink-soft",
};

function HeadlineCard({ h }: { h: Headline }) {
  const hold = h.holdout;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-semibold">{SEGMENT_LABEL[h.segment]}</h3>
          <p className="text-[12px] text-ink-faint">{SEGMENT_NOTE[h.segment]}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${EVIDENCE_STYLE[h.evidence]}`}>Evidens: {h.evidence}</span>
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">
        Anbefalet metode: <strong className="text-ink">{METHOD_SHORT[h.recommended]}</strong>. {h.reason}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-border pt-3 text-[12px]">
        <div><dt className="text-ink-faint">Typisk fejl (MdAPE), 2021-2024</dt><dd className="text-base font-semibold tabular-nums text-ink">{fmt.pct(h.rolling.mdape)} <span className="text-[11px] font-normal text-ink-faint">n={h.rolling.n}</span></dd></div>
        <div><dt className="text-ink-faint">Bias (median fortegnsfejl)</dt><dd className="text-base font-semibold tabular-nums text-ink">{fmt.signedPct(h.rolling.bias)}</dd></div>
        <div><dt className="text-ink-faint">Dækning af 80 %-interval</dt><dd className="font-semibold tabular-nums text-ink">{fmt.pct(h.rolling.coverage)} <span className="text-[11px] font-normal text-ink-faint">({fmt.range(h.rolling.coverage_ci90)})</span></dd></div>
        <div><dt className="text-ink-faint">Urørt testsæt, 2025 og frem</dt><dd className="font-semibold tabular-nums text-ink">{hold ? <>{fmt.pct(hold.mdape)} <span className="text-[11px] font-normal text-ink-faint">n={hold.n}, bias {fmt.signedPct(hold.bias)}</span></> : "-"}</dd></div>
      </dl>
      <p className="mt-3 text-[12px] text-ink-faint">{h.evidenceWhy}</p>
    </Card>
  );
}

export function AnalysisTab() {
  const [seg, setSeg] = useState<HedonicSegment>("apartment");
  const { audit, descriptive, rolling } = R.dev;
  const headlines = useMemo(() => SEGMENTS.map((s) => buildHeadline(R, s)).filter((h): h is Headline => h !== null), []);
  const current = buildHeadline(R, seg);
  const pooled = rolling.pooled.filter((r) => r.segment === seg);
  const finalRows = R.final.summary.filter((r) => r.segment === seg);
  const yearly = descriptive.yearly[seg] ?? [];
  const quarterly = descriptive.quarterly[seg] ?? [];
  const thinQuarters = quarterly.filter((q) => q.n < 5).length;
  const scoring = R.scoring.segments[seg];
  const recommended = current?.recommended ?? "a1";
  const years = R.dev.rolling.test_years;
  const prov = R.provenance;

  const cellRows = (["price_class", "age_class", "block"] as const).flatMap((dim) =>
    rolling.cells[dim]
      .filter((c) => c.segment === seg && c.method === recommended)
      .map((c) => ({ dim, value: String(c[dim]), c })),
  );
  const dimLabel = { price_class: "Prisklasse", age_class: "Byggeår", block: "Retning fra centrum" } as const;
  const sensitivity = R.dev.sensitivity_exclude_flagged_train.filter((r) => r.segment === seg);
  const blocks = R.dev.spatial_blocks_within_9000.pooled.filter((r) => r.segment === seg);
  const common = rolling.common_subset_with_valuation.filter((r) => r.segment === seg);
  const paired = rolling.paired_vs_baseline.filter((r) => r.segment === seg);
  const scatter = rolling.scatter[seg];
  const salesYears = Object.keys(audit.sales_per_year[seg] ?? {}).filter((y) => Number(y) >= 2017);
  const post = R.scoring.post_hoc_relative_level[seg] ?? [];

  return (
    <div>
      <header className="mb-8">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-text">Analyse</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Hvad bør en bolig i 9000 koste?</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-soft">
          Hedonisk prisestimat ud fra faktiske salgspriser, målt mod to enkle baselines og to modeller. Målet er salgspris, ikke udbudspris.
          Alt herunder kommer fra pipelinen i <code className="rounded bg-surface-alt px-1.5 py-0.5">analysis/hedonic</code>. Siden regner ikke selv.
        </p>
        <p className="mt-3 max-w-3xl rounded-xl border border-border bg-surface-alt px-3.5 py-2.5 text-[12px] text-ink-soft" role="note">
          Grundlaget er tidligere salg af de boliger, der var til salg i sommeren 2026, hentet fra den tidligere Boligsiden-indsamling i databasen.
          Det er ikke et udsnit af alle handler i 9000. Siden viser kun aggregerede tal, ingen adresser og ingen enkeltannoncer.
        </p>
      </header>

      <Section id="svar" title="Direkte svar" intro="Kort fortalt: modellerne slår ikke de enkle baselines meningsfuldt, og tallene bør bruges som en grov pejling, ikke som en vurdering af en enkelt bolig.">
        <div className="grid gap-4 lg:grid-cols-2">{headlines.map((h) => <HeadlineCard key={h.segment} h={h} />)}</div>
        <Card>
          <ul className="grid list-disc gap-2 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
            <li>MdAPE er den mediane absolutte procentfejl. 15 % betyder, at halvdelen af estimaterne ligger mere end 15 % fra den faktiske salgspris.</li>
            <li>Beslutningsreglen blev fastlagt før modelsammenligningen: en model anbefales kun, hvis den er mindst {fmt.int((minRelativeImprovement(R) ?? 0.1) * 100)} % bedre end den bedste baseline, og bootstrap-intervallet for forskellen ligger helt under 0. Ellers anbefales baseline.</li>
            <li>Det urørte testsæt ({R.final.from} og frem) er åbnet én gang, efter modelvalget var gemt. {R.final.pristine ? "Det var urørt indtil da." : "Det er åbnet flere gange og er ikke længere urørt."} Det er for småt til at bære en konklusion.</li>
          </ul>
        </Card>
      </Section>

      <Section id="data" title="Datakvalitet" intro="Hvert filter er logget med antal. Outliers er flaget, ikke slettet.">
        <Table caption="Fra rå eksport til analysesæt" head={["Trin", "Fjernet", "Tilbage"]} wide
          rows={audit.steps.map((s) => [s.step, s.removed ? fmt.int(s.removed) : "-", fmt.int(s.remaining)])} />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="text-[14px] font-semibold">Hvad auditten fandt</h3>
            <ul className="mt-2 grid list-disc gap-2 pl-5 text-[13px] leading-relaxed text-ink-soft">
              <li><strong className="text-ink">Udvælgelse.</strong> Handlerne er tidligere salg af boliger, der er til salg nu. De seneste måneder er derfor næsten tomme, og boliger der er solgt og ikke genudbudt, mangler helt. Antal handler pr. år vises nedenfor.</li>
              <li><strong className="text-ink">Dubletter.</strong> {audit.steps.find((s) => s.step.startsWith("Dubletter"))?.removed ?? 0} fjernet efter reglen: samme bolig, samme dag, forskellig pris udelades. Samme bolig og samme pris inden for 60 dage tælles som ét salg.</li>
              <li><strong className="text-ink">Ny bygning.</strong> Handler, hvor den nuværende bygning er opført efter salget, er fjernet, fordi areal og byggeår hører til en anden bygning.</li>
              <li><strong className="text-ink">Flag.</strong> {audit.flags.ppsqm_outlier} handler har usædvanlig pris pr. m² (robust z over {audit.flags.robust_z_threshold}), {audit.flags.area_drift} har et areal, der afviger mere end {fmt.pct(audit.area_drift.tolerance)} fra arealet registreret ved salget. De indgår i hovedanalysen. Følsomhedsanalysen herunder fjerner dem fra træningsdata.</li>
              <li><strong className="text-ink">Areal, værelser, byggeår</strong> er hentet fra den nuværende annonce og bruges også for ældre salg. For {fmt.pct(audit.area_drift.share_of_clean)} af handlerne findes et areal fra salgstidspunktet. Hvor begge findes, er medianafvigelsen {fmt.pct(audit.area_drift.median_abs_deviation)}, og {fmt.pct(audit.area_drift.share_beyond_tolerance)} afviger mere end {fmt.pct(audit.area_drift.tolerance)}.</li>
            </ul>
          </Card>
          <Card>
            <h3 className="text-[14px] font-semibold">Join og offentlig vurdering</h3>
            <ul className="mt-2 grid list-disc gap-2 pl-5 text-[13px] leading-relaxed text-ink-soft">
              <li><strong className="text-ink">Handel til bolig:</strong> alle handler hører til en bolig i databasen (0 forældreløse, SQL-tjek 2. november 2026). I 9000 har 853 af 863 annoncer et BFE-nummer, og 362 af dem har mindst én vurdering i tabellen.</li>
              <li><strong className="text-ink">Vurdering kendt ved salget:</strong> kun vurderinger med registreringstidspunkt før salgsdatoen bruges. For de ældre vurderingsår er registreringstidspunktet ofte 13. september 2013, altså en registermigration og ikke den dag, vurderingen blev offentliggjort. Reglen er derfor forsigtig og udelukker de fleste vurderinger for ældre salg.</li>
              {SEGMENTS.map((s) => {
                const v = audit.vur[s];
                return v ? <li key={s}><strong className="text-ink">{SEGMENT_LABEL[s]}:</strong> {fmt.int(v.with_asof_valuation)} af {fmt.int(v.n)} handler ({fmt.pct(v.share)}) har en kendt vurdering. Median salgspris/vurdering er {fmt.dec2(v.price_to_valuation_median)}.</li> : null;
              })}
              <li><strong className="text-ink">Handelstyper:</strong> median af pris / (indeks × areal) for hver type vises nedenfor. 1,00 er samme niveau som /stats-indekset.</li>
            </ul>
          </Card>
        </div>
        <Table caption="Handelstyper før filtrering" head={["Segment og type", "n", "Median pris / (indeks × areal)"]}
          rows={audit.sale_type_diagnostic.map((d) => [`${SEGMENT_LABEL[d.segment]}, ${d.sale_type}`, fmt.int(d.n), fmt.dec2(d.median_rel_to_index)])} />
      </Section>

      <Section id="beskrivelse" title="Priser og sammensætning"
        intro="Pris, areal og byggeår står side om side. Skifter de solgte boliger karakter, er en prisændring ikke bare prisudvikling.">
        <div><SegmentToggle value={seg} onChange={setSeg} /></div>
        <Table caption={`Årlige tal for ${SEGMENT_LABEL[seg]}`} wide
          head={["År", "Handler", "Boliger", "Median pris", "Median kr./m²", "Median m²", "Median byggeår", ...(seg === "house" ? ["Rækkehusandel"] : []), "Pris ift. indeks × m²"]}
          rows={yearly.map((y) => [String(y.year), fmt.int(y.n), fmt.int(y.unique_properties), fmt.mio(y.median_price), fmt.int(y.median_ppsqm), fmt.int(y.median_area), fmt.int(y.median_building_year),
            ...(seg === "house" ? [fmt.pct(y.share_terraced)] : []), fmt.dec2(y.relative_to_index_median)])} />
        <p className="max-w-3xl text-[12px] text-ink-faint">
          Handler siden 2017 pr. år, {SEGMENT_LABEL[seg].toLowerCase()}: {salesYears.map((y) => `${y}: ${audit.sales_per_year[seg]![y]}`).join(", ")}. {thinQuarters} af {quarterly.length} kvartaler har færre end 5 handler, så kvartalsmedianer er ikke vist.
          Kolonnen yderst til højre er medianen af salgspris divideret med /stats-indekset (villaer og rækkehuse, måneden før salget) gange boligens areal.
        </p>
      </Section>

      <Section id="validering" title="Metode og validering"
        intro={`Rolling-origin: træn på alt før 1. januar, test på hele året (${years.join(", ")}). Samme bolig ligger aldrig i både træning og test. Al tuning sker kun på træningsdata. Metrikken er fastlagt før sammenligningen.`}>
        <div><SegmentToggle value={seg} onChange={setSeg} /></div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-[14px] font-semibold">Median absolut procentfejl pr. metode</h3>
            <MethodBars ariaLabel={`MdAPE pr. metode for ${SEGMENT_LABEL[seg]}`}
              bars={METHOD_ORDER.map((m) => ({ id: m, label: METHOD_SHORT[m], value: rowFor(pooled, seg, m)?.mdape ?? null, n: rowFor(pooled, seg, m)?.n ?? 0, highlight: m === recommended }))} />
            <p className="mt-3 text-[11px] text-ink-faint">Lavere er bedre. Baseline B dækker kun handler med en kendt vurdering, så n er lavere og sammenligningen ikke ligefrem.</p>
          </Card>
          <Card>
            <h3 className="mb-3 text-[14px] font-semibold">Estimeret mod faktisk pris, {METHOD_SHORT[scatter?.method ?? recommended]}</h3>
            {scatter && <ScatterChart points={scatter.points} xLabel="Faktisk salgspris" yLabel="Estimat" ariaLabel={`Estimeret mod faktisk salgspris, ${SEGMENT_LABEL[seg]}, n=${scatter.points.length}`} />}
            <p className="mt-2 text-[11px] text-ink-faint">Test på senere år, n={scatter?.points.length}. Logaritmiske akser, afrundet til 10.000 kr. Stiplet linje: estimat lig faktisk pris.</p>
          </Card>
        </div>
        <Table caption="Rolling-origin, samlet" wide head={["Metode", "n", "MdAPE", "Bias", "90. percentil af fejl", "Dækning (mål 80 %)", "Relativ bredde"]}
          rows={METHOD_ORDER.map((m) => rowFor(pooled, seg, m)).filter((r): r is SegmentMethodRow => !!r).map((r) => [
            METHOD_SHORT[r.method as HedonicMethod], `${r.n}/${r.n_total}`, fmt.pct(r.mdape), fmt.signedPct(r.bias), fmt.pct(r.p90_ape),
            r.coverage === null ? "-" : `${fmt.pct(r.coverage)} (${fmt.range(r.coverage_ci90)})`, fmt.pct(r.median_rel_width)])} />
        <p className="max-w-3xl text-[12px] text-ink-faint">
          Bias er median af (estimat − pris) / pris. Dækning er andelen af testhandler inden for intervallet med 90 %-Wilson-interval i parentes.
          Intervallerne er konforme på log-residualer fra de seneste 12 måneder før testen og måles på senere data, ikke på kalibreringsdata. Konform garanti forudsætter udskiftelige data, og salgsdata er tidsafhængige, så dækningen skal læses som målt, ikke som garanteret.
        </p>
        <Table caption="Challenger mod baseline, parret" wide head={["Challenger mod baseline", "n", "Forskel i MdAPE", "90 % bootstrap-interval", "Relativ ændring"]}
          rows={paired.map((p) => [`${METHOD_SHORT[p.challenger]} mod ${METHOD_SHORT[p.baseline]}`, fmt.int(p.n), fmt.signedPp(p.diff),
            p.lo === null || p.hi === null ? "-" : `${fmt.signedPp(p.lo)} til ${fmt.signedPp(p.hi)}`, fmt.signedPct(p.relative_change)])} />
        <p className="max-w-3xl text-[12px] text-ink-faint">Negativ forskel betyder, at challengeren er bedre. Forskellen er i procentpoint af MdAPE. Der er genudtrukket hele boliger, ikke enkelthandler. Intervallet afspejler stikprøvestøj, ikke fejl i datavalget.</p>

        <h3 className="text-[15px] font-semibold">Pr. segment, anbefalet metode ({METHOD_SHORT[recommended]})</h3>
        <Table caption="Fejl pr. prisklasse, byggeår og retning" wide head={["Opdeling", "n", "MdAPE", "Bias", "Dækning", ""]}
          rows={cellRows.map(({ dim, value, c }) => [`${dimLabel[dim]}: ${value}`, fmt.int(c.n), fmt.pct(c.mdape), fmt.signedPct(c.bias), fmt.pct(c.coverage), c.indicative ? "vejledende (n under 30)" : ""])} />

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-2 text-[14px] font-semibold">Følsomhed: flaggede handler fjernet fra træning</h3>
            <Table caption="Følsomhed over for outliers" compact head={["Metode", "MdAPE", "Ændring"]}
              rows={sensitivity.map((r) => {
                const base = rowFor(pooled, seg, r.method);
                return [METHOD_SHORT[r.method as HedonicMethod], fmt.pct(r.mdape), base?.mdape != null && r.mdape != null ? fmt.signedPp(r.mdape - base.mdape) : "-"];
              })} />
          </Card>
          <Card>
            <h3 className="mb-2 text-[14px] font-semibold">Samme handler: kun dem med en kendt vurdering</h3>
            <Table caption="Alle metoder på handler hvor baseline B kan vurdere" compact head={["Metode", "n", "MdAPE", "Bias"]}
              rows={common.map((r) => [METHOD_SHORT[r.method as HedonicMethod], fmt.int(r.n), fmt.pct(r.mdape), fmt.signedPct(r.bias)])} />
          </Card>
        </div>

        <Card>
          <h3 className="text-[14px] font-semibold">Retningsblokke inden for 9000 (ikke nye geografier)</h3>
          <p className="mt-1 max-w-3xl text-[12px] text-ink-faint">{R.dev.spatial_blocks_within_9000.note} Der er kun ét postnummer i data, så en test på hele nye områder kan ikke udføres.</p>
          <div className="mt-3">
            <Table caption="Leave-one-block-out" compact head={["Metode", "n", "MdAPE", "Bias"]}
              rows={blocks.map((r) => [METHOD_SHORT[r.method as HedonicMethod], fmt.int(r.n), fmt.pct(r.mdape), fmt.signedPct(r.bias)])} />
          </div>
        </Card>

        <Card className="border-amber-400/60">
          <h3 className="text-[14px] font-semibold">Urørt testsæt: {R.final.from} og frem</h3>
          <p className="mt-1 max-w-3xl text-[12px] text-ink-soft">
            Åbnet én gang efter modelvalget. Tallene er vejledende (n under 30) og er ikke brugt til at ændre valget. Fejlen er markant større end i rolling-origin. Se begrænsninger.
          </p>
          <div className="mt-3">
            <Table caption="Urørt testsæt" compact head={["Metode", "n", "MdAPE", "Bias", "Dækning"]}
              rows={finalRows.map((r) => [METHOD_SHORT[r.method as HedonicMethod], `${r.n}/${r.n_total}`, fmt.pct(r.mdape), fmt.signedPct(r.bias), fmt.pct(r.coverage)])} />
          </div>
        </Card>
      </Section>

      <Section id="anvendelse" title="Anvendelse på annoncer"
        intro="En annonce scores som estimat, interval og antal sammenlignelige salg. Forholdet mellem udbudspris og estimat er et signal, ikke en dom. Annoncer uden grundlag er markeret som ikke vurderbare.">
        <div><SegmentToggle value={seg} onChange={setSeg} /></div>
        {scoring && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="text-[14px] font-semibold">{SEGMENT_LABEL[seg]}: {fmt.int(scoring.listings)} annoncer, metode {METHOD_SHORT[scoring.method]}</h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-[12px]">
                <div><dt className="text-ink-faint">Vurderbare</dt><dd className="text-base font-semibold tabular-nums">{fmt.int(scoring.assessable)}</dd></div>
                <div><dt className="text-ink-faint">Median sammenlignelige salg</dt><dd className="text-base font-semibold tabular-nums">{fmt.int(scoring.median_comparables)}</dd></div>
                <div><dt className="text-ink-faint">Interval bygger på</dt><dd className="font-semibold tabular-nums">{scoring.n_calibration} handler, {scoring.calibration_window_months} mdr.</dd></div>
                <div><dt className="text-ink-faint">Median halv bredde af interval</dt><dd className="font-semibold tabular-nums">{fmt.pct(scoring.median_rel_halfwidth)}</dd></div>
              </dl>
              <ul className="mt-3 grid list-disc gap-1 pl-5 text-[12.5px] text-ink-soft">
                {Object.entries(scoring.not_assessable).filter(([, n]) => n > 0).map(([k, n]) => <li key={k}>Ikke vurderbare: {fmt.int(n)}. {R.scoring.reasons[k]}.</li>)}
              </ul>
              <p className="mt-3 text-[11px] text-ink-faint">
                Markedsniveau: /stats-indekset for {R.scoring.meta.index_month_used} ({fmt.int(R.scoring.meta.index_value)} kr./m²), {R.scoring.meta.index_months_stale} måned ældre end ønsket. Kalibreringsvinduet er udvidet, fordi de seneste 12 måneder har for få handler, og denne udvidelse er ikke testet i rolling-origin.
              </p>
            </Card>
            <Card>
              <h3 className="text-[14px] font-semibold">Resultatet afhænger af metoden</h3>
              <p className="mt-1 text-[12px] text-ink-soft">Median af udbudspris / estimat over de annoncer, der har et punktestimat (n={fmt.int(scoring.with_point_estimate)}).</p>
              <div className="mt-3">
                <Table caption="Udbudspris i forhold til estimat pr. metode" compact head={["Metode", "Median udbudspris / estimat"]}
                  rows={(["a1", "a2", "ridge", "gbm"] as const).map((m) => [METHOD_SHORT[m] + (m === scoring.method ? " (anbefalet)" : ""), fmt.dec2(scoring.median_asking_over_estimate_by_method[m])])} />
              </div>
              <p className="mt-3 text-[12px] text-ink-soft">
                Metoderne er uenige om niveauet (median spredning mellem laveste og højeste estimat pr. annonce: {fmt.pct(scoring.model_spread_median)}). En enkelt annoncers ratio kan derfor ikke tolkes som over- eller underpris.
              </p>
            </Card>
          </div>
        )}
        <Table caption="Niveau pr. salgsår, post hoc" head={["Salgsår", "Handler", "Boliger", "Median pris / (indeks × m²)"]}
          rows={post.map((p) => [String(p.year), fmt.int(p.n), fmt.int(p.unique_properties), fmt.dec2(p.median_price_vs_index_area)])} />
        <p className="max-w-3xl text-[12px] text-ink-faint">
          Post hoc opgørelse, lavet efter det urørte testsæt blev åbnet og ikke brugt til at ændre noget. Lavere værdier for de seneste år kan skyldes markedet, men også udvælgelsen (kun boliger, der er genudbudt) eller at /stats-indekset gælder villaer og rækkehuse, mens lejligheder prissættes anderledes. Dataene kan ikke skille forklaringerne ad.
        </p>
      </Section>

      <Section id="begraensninger" title="Begrænsninger og næste data">
        <Card>
          <ul className="grid list-disc gap-2 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
            <li><strong className="text-ink">Udvælgelse og højre censurering.</strong> Kun boliger, der er til salg nu, har en salgshistorik her. De nyeste salg er næsten fraværende, og de, der findes, er solgt og genudbudt hurtigt, hvilket ikke er typisk.</li>
            <li><strong className="text-ink">Nuværende egenskaber for gamle salg.</strong> Areal, værelser og byggeår er fra i dag. Ombygninger og renoveringer efter salget kan ikke ses, og stand er slet ikke med.</li>
            <li><strong className="text-ink">Små stikprøver.</strong> Huse: {fmt.int(audit.properties.house?.sales)} handler på {fmt.int(audit.properties.house?.unique_properties)} boliger i hele perioden. Ingen konklusion om huse kan bære en enkelt annonce.</li>
            <li><strong className="text-ink">Kun ét postnummer.</strong> Generalisering til andre områder er ikke testet og kan ikke testes med disse data.</li>
            <li><strong className="text-ink">Ingen kausale påstande.</strong> Modellerne beskriver sammenhænge i salgspriserne, ikke hvad der påvirker prisen.</li>
            <li><strong className="text-ink">Kilde.</strong> Grundlaget er tidligere indsamlede Boligsiden-data. Boligsidens datapolitik forbyder scraping uden aftale, og indsamlingen er stoppet af den grund. Brug af de gemte data er en bevidst beslutning taget af ejeren af projektet og bør afklares juridisk, før resultaterne deles uden for projektet.</li>
          </ul>
        </Card>
        <Card>
          <h3 className="text-[14px] font-semibold">Mest nyttige næste data</h3>
          <ol className="mt-2 grid list-decimal gap-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
            <li>Alle handler i området fra tinglysning/EJF, ikke kun af boliger, der er til salg nu (adgang kræver MitID Erhverv hos Geodatastyrelsen).</li>
            <li>BBR-oplysninger på salgstidspunktet (areal, tilbygninger, opførelsesår) i stedet for de nuværende.</li>
            <li>Vurderinger med den faktiske offentliggørelsesdato.</li>
            <li>Flere postnumre, så generalisering til nye områder kan testes.</li>
          </ol>
        </Card>
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Genereret {prov.generated_at}. Frø {prov.seed}. Python {prov.python}, {Object.entries(prov.packages).map(([k, v]) => `${k} ${v}`).join(", ")}.
          Kode: <code className="rounded bg-surface-alt px-1">{prov.git_commit?.slice(0, 7) ?? "ukendt"}</code>, konfiguration <code className="rounded bg-surface-alt px-1">{prov.config_sha256.slice(0, 8)}</code>.
          Datahash: {Object.entries(prov.data_sha256).map(([k, v]) => `${k} ${v.slice(0, 8)}`).join(", ")}.
          Kør igen: se <code className="rounded bg-surface-alt px-1">analysis/hedonic/README.md</code>.
        </p>
      </Section>
    </div>
  );
}

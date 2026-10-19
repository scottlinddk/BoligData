import type { SchoolDistrictResult } from "@shared/types/school-district";
import { useI18n } from "@/i18n/i18n";
import { useSchoolDistrict } from "@/hooks/use-school-district";

export function SchoolDistrictPanel({ propertyId }: { propertyId: string }) {
  const query = useSchoolDistrict(propertyId);
  return <SchoolDistrictContent result={query.data} loading={query.isPending} failed={query.isError} onRetry={() => { void query.refetch(); }} />;
}

export function SchoolDistrictContent({ result, loading, failed, onRetry }: {
  result?: SchoolDistrictResult; loading: boolean; failed: boolean; onRetry: () => void;
}) {
  const { language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const unavailable = failed || result?.status === "unavailable";
  const confidence = result && ({ high: tx("Høj", "High"), medium: tx("Middel", "Medium"), low: tx("Lav", "Low"), unknown: tx("Ikke oplyst", "Not provided") })[result.confidence];
  return <section className="rounded-2xl bg-surface-alt p-5 sm:p-7" aria-labelledby="school-district-heading">
    <h2 id="school-district-heading" className="text-xl font-medium tracking-tight">{tx("Skoledistrikt", "School district")}</h2>
    <p className="mt-1 text-sm text-ink-soft">{tx("Vejledende distriktsskole for boligens adresse", "Advisory catchment school for this home's address")}</p>
    {loading && <p role="status" className="mt-4 text-sm text-ink-soft">{tx("Henter skoledistrikt…", "Loading school district…")}</p>}
    {!loading && unavailable && <div role="status" className="mt-4 rounded-xl border border-border p-4 text-sm">
      <p>{result?.reason === "address_mismatch" || result?.reason === "address_ambiguous" || result?.reason === "address_missing"
        ? tx("Adressen kunne ikke matches entydigt. Slå den op hos Skoledistrikt.dk.", "The address could not be matched unambiguously. Look it up on Skoledistrikt.dk.")
        : result?.reason === "nonlive_data"
          ? tx("Skoledistrikter hentes kun for rigtige annoncer.", "School districts are only retrieved for real listings.")
          : tx("Skoledistriktet kunne ikke hentes lige nu.", "The school district could not be retrieved right now.")}</p>
      {result?.reason !== "nonlive_data" && <button type="button" onClick={onRetry} className="mt-2 font-semibold underline">{tx("Prøv igen", "Try again")}</button>}
    </div>}
    {!loading && !unavailable && result && <>
      <p className="mt-4 text-sm text-ink-soft">{result.address}{result.municipality && ` · ${result.municipality}`}</p>
      {result.status === "not_found" ? <p role="status" className="mt-3 text-sm">{tx("Kilden fandt intet skoledistrikt for adressen. Det betyder ikke, at boligen ikke har en distriktsskole.", "The source found no district for this address. This does not mean the home has no catchment school.")}</p> : <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {result.matches.map((school, index) => <li key={`${school.schoolName}-${index}`} className="rounded-xl border border-border bg-surface p-4">
          {school.schoolUrl ? <a className="font-semibold underline underline-offset-4" href={school.schoolUrl} target="_blank" rel="noopener noreferrer">{school.schoolName} ↗</a> : <p className="font-semibold">{school.schoolName}</p>}
          <p className="mt-2 text-sm text-ink-soft">{school.firstGrade !== null && school.lastGrade !== null
            ? tx(`${school.firstGrade}.–${school.lastGrade}. klasse`, `Grades ${school.firstGrade}–${school.lastGrade}`)
            : tx("Klassetrin ikke oplyst", "Grades not provided")}</p>
        </li>)}
      </ul>}
      <p className="mt-4 text-xs text-ink-soft">{result.provider !== "lifa" && <>{tx("Kildens sikkerhed", "Source confidence")}: {confidence} · </>}{tx("Hentet", "Retrieved")} {new Date(result.checkedAt).toLocaleDateString(language === "da" ? "da-DK" : "en-GB")}{result.source && ` · ${tx("Kildestatus", "Source status")}: ${result.source}`}</p>
    </>}
    <p className="mt-4 text-xs leading-5 text-ink-soft">{result?.provider === "lifa"
      ? tx("Vejledende oplysninger fra LIFA AdresseService, der daglig kobler adresser med kommunernes skoledistrikter.", "Advisory information from LIFA AdresseService, which matches addresses to the municipalities' school districts daily.")
      : tx("Vejledende oplysninger fra Skoledistrikt.dk, baseret på GeoFA og LIFA AdresseService.", "Advisory information from Skoledistrikt.dk, based on GeoFA and LIFA AdresseService.")}
      {" "}{tx("Distrikter, kapacitet og kommunale regler kan ændre sig. Bekræft altid skoleplaceringen hos kommunen.", "Districts, capacity and municipal rules can change. Always confirm the school assignment with the municipality.")}</p>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium">
      <a href="https://skoledistrikt.dk/" target="_blank" rel="noopener noreferrer" className="underline">{tx("Slå adresse op på Skoledistrikt.dk", "Look up the address on Skoledistrikt.dk")} ↗</a>
      {result?.status !== "unavailable" && result?.addressId && <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{tx("Se kildedata", "View source data")} ↗</a>}
    </div>
    {result?.disclaimer && <details className="mt-3 text-xs text-ink-soft"><summary className="w-fit cursor-pointer underline">{tx("Kildens forbehold", "Source disclaimer (Danish)")}</summary><p className="mt-2 leading-5" lang="da">{result.disclaimer}</p></details>}
  </section>;
}

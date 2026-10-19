import { useState } from "react";
import type { CadastralReport } from "@shared/types/cadastral";
import { useI18n } from "@/i18n/i18n";
import { useCadastral } from "@/hooks/use-cadastral";
import { ApiError } from "@/lib/api";
import { CadastralMap } from "./cadastral-map";

export function CadastralFacts({ report, language }: { report: CadastralReport; language: "da" | "en" }) {
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const area = (value: number | null) => value === null ? tx("Ikke oplyst", "Not available") : `${value.toLocaleString(language === "da" ? "da-DK" : "en-GB")} m²`;
  return <div className="mt-5 text-sm">
    <p className="text-ink-soft">{tx("Oplysningerne gælder den matrikulære ejendom. Grundareal og ejere kan være fælles for flere boliger.", "These records describe the cadastral land property. Land and owners may be shared by several homes.")}</p>
    {report.status !== "available" && <p role="status" className="mt-3 text-warning-text">{tx("Matrikeloplysninger kunne ikke hentes for denne bolig. Se den officielle kilde eller prøv igen senere.", "Cadastral records could not be retrieved for this home. Check the official source or try again later.")}</p>}
    <dl className="mt-4 grid grid-cols-2 gap-5">
      <div><dt className="text-xs text-ink-soft">BFE</dt><dd className="mt-1 font-medium">{report.bfeNumber ?? tx("Ikke fundet", "Not found")}</dd></div>
      <div><dt className="text-xs text-ink-soft">{tx("Samlet areal", "Total land area")}</dt><dd className="mt-1 font-medium">{area(report.totalAreaSqm)}</dd><dd className="text-xs text-ink-soft">{tx("Alle direkte jordstykker, ekskl. fælleslodsandele", "All direct parcels, excluding shared-lot interests")}</dd></div>
      {report.landUse && <div><dt className="text-xs text-ink-soft">{tx("Landbrugsnotering", "Agricultural registration")}</dt><dd>{report.landUse}</dd></div>}
    </dl>
    {report.condominiumParent && <p className="mt-3">{tx("Ejendommen er opdelt i ejerlejligheder. Grundarealet er ikke den enkelte lejligheds areal.", "The property is divided into condominiums. The land area is not the area of the individual apartment.")}</p>}
    {report.commonLot && <p className="mt-3">{tx("Registreret som fælleslod.", "Registered as a shared lot.")}</p>}
    {report.separateRoad && <p className="mt-3">{tx("Registreret som udskilt vej.", "Registered as a separately registered road.")}</p>}
    {report.parcels.length > 0 && <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left font-medium">{tx("Jordstykker", "Parcels")}</caption><thead><tr className="border-b border-border text-xs text-ink-soft"><th className="py-2 pr-3">{tx("Matrikel / ejerlav", "Parcel / district")}</th><th className="py-2 pr-3">{tx("Registreret areal", "Registered area")}</th><th className="py-2">{tx("Heraf vej", "Of which road")}</th></tr></thead><tbody>{report.parcels.map(parcel => <tr key={parcel.id} className="border-b border-border"><td className="py-3 pr-3">{parcel.number ?? "—"}<span className="block text-xs text-ink-soft">{parcel.district ?? "—"} {parcel.districtCode ? `(${parcel.districtCode})` : ""}</span>{[parcel.forestAreaSqm !== null && parcel.forestAreaSqm > 0 ? `${tx("Fredskov", "Protected forest")}: ${area(parcel.forestAreaSqm)}` : null, parcel.coastalProtectionAreaSqm !== null && parcel.coastalProtectionAreaSqm > 0 ? `${tx("Strandbeskyttelse", "Coastal protection")}: ${area(parcel.coastalProtectionAreaSqm)}` : null, parcel.duneProtectionAreaSqm !== null && parcel.duneProtectionAreaSqm > 0 ? `${tx("Klitfredning", "Dune protection")}: ${area(parcel.duneProtectionAreaSqm)}` : null].filter(Boolean).map(note => <span key={note} className="block text-xs text-ink-soft">{note}</span>)}</td><td className="py-3 pr-3">{area(parcel.registeredAreaSqm)}</td><td className="py-3">{area(parcel.roadAreaSqm)}</td></tr>)}</tbody></table></div>}
    {!report.parcelsComplete && report.status === "available" && <p className="mt-3 text-warning-text">{tx("Listen over jordstykker er ufuldstændig. Samlet areal vises først, når alle arealer er kendt.", "The parcel list is incomplete. Total area is shown only when every area is known.")}</p>}
    <CadastralMap report={report} language={language} />
    {!report.geometry && !(report.parcelsComplete && report.parcels.length > 0 && report.parcels.every(p => p.geometry)) && <p className="mt-4 text-ink-soft">{tx("Komplet skelgeometri er ikke tilgængelig her.", "Complete boundary geometry is unavailable here.")}</p>}
    <h3 className="mt-6 font-medium">{tx("Ejeroplysninger for den matrikulære ejendom", "Owners of the cadastral land property")}</h3>
    {report.owners.status === "available" ? <ul className="mt-3 space-y-3">{report.owners.items.map((owner, i) => <li key={i} className="rounded-xl border border-border p-3"><p className="font-medium">{owner.protected ? tx("Navne-/adressebeskyttelse", "Protected name/address") : owner.name ?? tx("Navn ikke oplyst", "Name unavailable")}</p>{owner.companyNumber && <p>CVR: {owner.companyNumber}</p>}<p>{tx("Faktisk ejerandel", "Actual ownership share")}: {owner.actualShare ?? "—"} · {tx("Tinglyst ejerandel", "Registered share")}: {owner.registeredShare ?? "—"}</p>{owner.takeoverDate && <p>{tx("Overtagelsesdato", "Takeover date")}: {owner.takeoverDate}</p>}{owner.registrationDate && <p>{tx("Tinglysningsdato", "Registration date")}: {owner.registrationDate}</p>}</li>)}</ul> : <p className="mt-2 text-ink-soft">{report.owners.reason === "condominium_parent" ? tx("Ejere skal slås op på den enkelte ejerlejligheds BFE-nummer i Matriklen.", "Look up owners using the individual condominium's BFE number in Matriklen.") : report.owners.reason === "common_lot" ? tx("Ejerforhold for fælleslodden skal undersøges i tingbogen.", "Consult the land register for ownership of this shared lot.") : report.owners.status === "requires_access" ? tx("Kilden kræver adgang for at vise ejeroplysninger. Åbn Matriklen for at fortsætte.", "The source requires access to show owners. Open Matriklen to continue.") : tx("Ejeroplysninger er ikke tilgængelige fra kilden lige nu.", "Owner information is currently unavailable from the source.")}</p>}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-soft"><span>{tx("Kilde: Matriklen / Geodatastyrelsen · Hentet", "Source: Matriklen / Geodatastyrelsen · Retrieved")} {new Date(report.checkedAt).toLocaleString(language === "da" ? "da-DK" : "en-GB")}</span><a href={report.mapUrl ?? "https://www.matriklen.dk/kort"} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-text underline">{tx("Åbn officielt matrikelkort", "Open official cadastral map")} ↗</a></div>
  </div>;
}

export function CadastralPanel({ propertyId }: { propertyId: string }) {
  const { language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const [opened, setOpened] = useState(false);
  const query = useCadastral(propertyId, opened);
  return <details className="rounded-2xl bg-surface-alt p-5 sm:p-7" onToggle={event => { if (event.currentTarget.open) setOpened(true); }}>
    <summary className="cursor-pointer"><span className="text-xl font-medium tracking-tight">{tx("Matrikel, grundareal og ejere", "Cadastre, land area and owners")}</span><span className="mt-1 block text-sm text-ink-soft">{tx("Matrikelkort, samlet areal og ejeroplysninger fra Matriklen", "Cadastral map, total land area and owner information from Matriklen")}</span></summary>
    {opened && query.isPending && <p role="status" className="mt-4 text-sm">{tx("Henter matrikeloplysninger…", "Loading cadastral records…")}</p>}
    {query.data && <CadastralFacts report={query.data} language={language} />}
    {query.isError && <p role="status" className="mt-4 text-sm text-warning-text">{query.error instanceof ApiError && query.error.status === 429 ? tx("Grænsen for registeropslag er nået. Prøv igen om en time.", "The register lookup limit has been reached. Try again in an hour.") : tx("Matrikeloplysninger kunne ikke hentes.", "Cadastral records could not be loaded.")}</p>}
    {(query.isError || (query.data && (query.data.status !== "available" || query.data.owners.status === "unavailable"))) && <button type="button" onClick={() => { void query.refetch(); }} disabled={query.isFetching} className="mt-3 text-sm font-semibold underline disabled:opacity-50">{tx("Prøv igen", "Try again")}</button>}
  </details>;
}

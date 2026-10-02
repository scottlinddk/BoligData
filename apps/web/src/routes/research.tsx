import { lazy, Suspense, useState } from "react";
import { LoadingStatus, Skeleton, Spinner } from "@/components/ui/loading";
import { Link } from "react-router-dom";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBuyingProject, type BuyingProject } from "@shared/analysis";
import { getProperty } from "@/lib/api";
import { findResearchProperties, getResearchAssessments, getResearchHistory, getResearchProject, saveResearchProject } from "@/lib/research-api";
import { researchDecision } from "@/lib/research-view";
import { useAuth } from "@/hooks/use-auth";
import { ProjectEditor } from "@/components/research/project-editor";
import { ResearchStatistics } from "@/components/research/statistics";
import { ResearchImportPanel } from "@/components/research/import-panel";
import { buttonClass, inputClass, Money, Panel, primaryClass, Status, useResearchText } from "@/components/research/fields";

const MarketIndex = lazy(() => import("@/components/research/market-index").then(module => ({ default: module.MarketIndex })));

export function ResearchPage() {
  const tx = useResearchText(); const { user } = useAuth(); const client = useQueryClient();
  const [tab, setTab] = useState("candidates"); const [projectDraft, setProjectDraft] = useState<BuyingProject | null>(null);
  const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  const [address, setAddress] = useState(""); const [search, setSearch] = useState("");
  const projectQuery = useQuery({ queryKey: ["research-project", user?.id], queryFn: getResearchProject, enabled: !!user });
  const assessmentsQuery = useQuery({ queryKey: ["research-assessments", user?.id], queryFn: getResearchAssessments, enabled: !!user });
  const historyQuery = useQuery({ queryKey: ["research-history", user?.id], queryFn: () => getResearchHistory(), enabled: !!user });
  const searchQuery = useQuery({ queryKey: ["research-find", user?.id, search], queryFn: () => findResearchProperties(search), enabled: !!user && !!search });
  const [selected, setSelected] = useState<string[]>([]);
  const propertyQueries = useQueries({ queries: selected.map(id => ({ queryKey: ["property", id], queryFn: () => getProperty(id) })) });
  const project = projectDraft ?? projectQuery.data?.project ?? createBuyingProject();
  const assessments = assessmentsQuery.data?.assessments ?? [];
  async function saveProject() {
    setSaving(true); setMessage("");
    try { await saveResearchProject(project); await client.invalidateQueries({ queryKey: ["research-project", user?.id] }); setProjectDraft(null); setMessage(tx("Profil gemt. Kandidater genberegnes med de nye krav.", "Profile saved. Candidates are recalculated with the new requirements.")); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Error"); }
    finally { setSaving(false); }
  }
  return <div className="px-4 py-6"><p className="ds-mono text-[10px] text-ink-soft">{tx("Fra bolig til fremvisningsbeslutning", "From property to viewing decision")}</p><h1 className="mb-3 mt-2 text-3xl font-bold tracking-tight">{tx("Mit boligprojekt", "My buying project")}</h1><p className="mb-5 max-w-3xl text-sm text-ink-soft">{tx("Undersøg krav, samlet økonomi og dokumentation. Din profil, noter og maksimale købspris er private.", "Research suitability, total project costs and documentation. Your profile, notes and maximum purchase price are private.")}</p>
    <form className="mb-5 flex gap-2" onSubmit={e => { e.preventDefault(); setSearch(address.trim()); }}><input aria-label={tx("Find adresse eller annoncelink", "Find address or listing link")} className={inputClass} value={address} onChange={e => setAddress(e.target.value)} placeholder={tx("Indtast adresse eller annoncelink…", "Enter address or listing link…")} /><button className={`${primaryClass} shrink-0`} type="submit">{tx("Undersøg bolig", "Research property")}</button></form>
    {search && <div className="mb-4 rounded-xl border border-border bg-surface p-3">{searchQuery.isFetching && <LoadingStatus>{tx("Søger…", "Searching…")}</LoadingStatus>}{searchQuery.isError && <p role="alert">{searchQuery.error.message}</p>}{(searchQuery.data?.properties ?? []).map(p => <Link className="block py-2 text-sm underline" key={p.id} to={`/property/${p.id}`}>{p.address}</Link>)}{searchQuery.data && !searchQuery.data.properties?.length && <p className="text-sm">{tx("Ingen registreret bolig fundet. Kun allerede indsamlede annoncer kan undersøges; prøv adressen.", "No stored property found. Research covers collected listings; try the address.")}</p>}</div>}
    <nav className="mb-5 flex flex-wrap gap-2" aria-label={tx("Projektvisning", "Project view")}>{[["candidates", "Kandidater", "Candidates"], ["profile", "Projektprofil", "Project profile"], ["statistics", "Statistik", "Statistics"], ["import", "Import", "Import"]].map(([id, da, en]) => <button key={id} className={tab === id ? primaryClass : buttonClass} onClick={() => setTab(id!)}>{tx(da!, en!)}</button>)}</nav>
    {(projectQuery.isError || assessmentsQuery.isError) && <p className="mb-4 rounded-xl bg-warning-soft p-3 text-sm text-warning-text" role="alert">{tx("Projektdata kunne ikke hentes", "Project data could not be loaded")}: {projectQuery.error?.message ?? assessmentsQuery.error?.message}</p>}
    {tab === "profile" && <>{projectQuery.isPending ? <div className="min-h-64"><LoadingStatus>{tx("Henter projektprofil…", "Loading project profile…")}</LoadingStatus><Skeleton className="mt-4 h-48 w-full" /></div> : !projectQuery.isError && <ProjectEditor project={project} onChange={setProjectDraft} />}<button className={`${primaryClass} mt-4`} disabled={saving || projectQuery.isPending || projectQuery.isError} onClick={saveProject} aria-busy={saving}>{saving ? <span className="inline-flex items-center gap-2"><Spinner />{tx("Gemmer…", "Saving…")}</span> : tx("Gem privat profil", "Save private profile")}</button>{message && <p role="status" className="mt-3 text-sm">{message}</p>}</>}
    {tab === "statistics" && <><Suspense fallback={<LoadingStatus>{tx("Henter markedsindeks…", "Loading market index…")}</LoadingStatus>}><MarketIndex /></Suspense>{historyQuery.isError && <p role="alert" className="mb-3 text-warning-text">{historyQuery.error.message}</p>}{historyQuery.data?.truncated && <p className="mb-3 text-sm text-warning-text">{tx("Delvist dataudtræk — statistikken dækker kun de hentede rækker.", "Partial extract — statistics cover retrieved rows only.")}</p>}{historyQuery.isPending ? <div className="min-h-64"><LoadingStatus>{tx("Henter salgshistorik…", "Loading sales history…")}</LoadingStatus><Skeleton className="mt-4 h-48 w-full" /></div> : !historyQuery.isError && <ResearchStatistics transactions={historyQuery.data?.transactions ?? []} dataVersion={historyQuery.data?.dataVersion ?? "unavailable"} minResidentialArea={project.minResidentialArea} />}</>}
    {tab === "import" && <ResearchImportPanel onImported={() => { void historyQuery.refetch(); }} />}
    {tab === "candidates" && <Panel title={tx("Sammenlign 2–4 kandidater", "Compare 2–4 candidates")}><p className="mb-3 text-sm text-ink-soft">{tx("Gem en undersøgelse på boligsiden for at tilføje en kandidat. Vælg op til fire nedenfor.", "Save research on a property page to add a candidate. Select up to four below.")}</p><div className="mb-4 flex flex-wrap gap-3">{assessments.map(({ assessment: a, property: p }) => <label className="rounded-xl border border-border p-3 text-sm" key={a.propertyId}><input type="checkbox" checked={selected.includes(a.propertyId)} disabled={!selected.includes(a.propertyId) && selected.length >= 4} onChange={e => setSelected(e.target.checked ? [...selected, a.propertyId] : selected.filter(id => id !== a.propertyId))} /> {p?.address ?? a.propertyId} <Link to={`/property/${a.propertyId}`} className="ml-2 underline">↗</Link></label>)}</div>{assessmentsQuery.isPending && <LoadingStatus>{tx("Henter kandidater…", "Loading candidates…")}</LoadingStatus>}<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border"><th className="p-2">{tx("Bolig", "Property")}</th><th className="p-2">{tx("Areal / soveværelser", "Area / bedrooms")}</th><th className="p-2">{tx("Maks. køb / projekt", "Max purchase / project")}</th><th className="p-2">{tx("Nødvendigt ekstra afslag", "Required further reduction")}</th><th className="p-2">{tx("Krav / økonomi / ukendte", "Suitability / economy / unknowns")}</th></tr></thead><tbody>{propertyQueries.map((q, i) => {
      const a = assessments.find(v => v.assessment.propertyId === selected[i])?.assessment;
      if (!q.data || !a) return <tr key={selected[i]}><td className="p-2" colSpan={5}>{q.isError ? q.error.message : tx("Henter…", "Loading…")}</td></tr>;
      const { budget, decision } = researchDecision(project, q.data.property, a); const b = budget[a.budgetScenario];
      return <tr key={a.propertyId} className="border-b border-border align-top"><td className="p-2"><Link className="font-bold underline" to={`/property/${a.propertyId}`}>{q.data.property.address}</Link></td><td className="p-2">{a.residentialArea ?? "?"} m² · {a.areaEvidence}<br />{a.legalBedrooms ?? "?"} · {a.bedroomEvidence}</td><td className="p-2"><Money value={b.maxPurchasePrice} /><br /><Money value={b.projectTotal} /></td><td className="p-2"><Money value={b.maxPurchasePrice === null ? null : Math.max(0, q.data.property.price - b.maxPurchasePrice)} /></td><td className="p-2"><div className="mb-2 flex gap-1"><Status value={decision.suitability} /><Status value={decision.economy} /></div>{decision.criteria.filter(c => c.status === "unknown").map(c => <p className="mb-1 text-xs" key={c.id}>{c.label}</p>)}{budget.unknownItems.length > 0 && <p className="text-xs">{tx("Ukendte budgetposter", "Unknown budget items")}: {budget.unknownItems.length}</p>}</td></tr>;
    })}</tbody></table></div></Panel>}
  </div>;
}

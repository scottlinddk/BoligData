import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBuyingProject, type BuyingProject } from "@shared/analysis";
import { getProperty } from "@/lib/api";
import { findResearchProperties, getResearchAssessments, getResearchHistory, getResearchProject, saveResearchProject } from "@/lib/research-api";
import { researchDecision } from "@/lib/research-view";
import { useAuth } from "@/hooks/use-auth";
import { LoadingStatus, PropertyCardSkeleton, Skeleton, Spinner } from "@/components/ui/loading";
import { DashboardWorkspace, WorkspaceEmpty, WorkspaceNavButton, WorkspacePropertyCard, WorkspacePropertyPreview, WorkspaceSection, WorkspaceStat } from "@/components/dashboard/workspace";
import { ProjectEditor } from "@/components/research/project-editor";
import { ResearchStatistics } from "@/components/research/statistics";
import { ResearchImportPanel } from "@/components/research/import-panel";
import { buttonClass, inputClass, Money, primaryClass, Status, useResearchText } from "@/components/research/fields";

const PAGE_SIZE = 6;
type ProjectView = "candidates" | "profile" | "statistics" | "import";

export function ResearchPage() {
  const tx = useResearchText();
  const { user } = useAuth();
  const client = useQueryClient();
  const [tab, setTab] = useState<ProjectView>("candidates");
  const [projectDraft, setProjectDraft] = useState<BuyingProject | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [address, setAddress] = useState("");
  const [search, setSearch] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [page, setPage] = useState(0);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState(false);

  const projectQuery = useQuery({ queryKey: ["research-project", user?.id], queryFn: getResearchProject, enabled: !!user });
  const assessmentsQuery = useQuery({ queryKey: ["research-assessments", user?.id], queryFn: getResearchAssessments, enabled: !!user });
  const historyQuery = useQuery({ queryKey: ["research-history", user?.id], queryFn: () => getResearchHistory(), enabled: !!user && tab === "statistics" });
  const searchQuery = useQuery({ queryKey: ["research-find", user?.id, search], queryFn: () => findResearchProperties(search), enabled: !!user && !!search });
  // Defaults are an explicitly labelled suggestion only after a successful read.
  // Never turn an unavailable private profile into an apparent real assessment.
  const project = projectQuery.isSuccess ? projectDraft ?? projectQuery.data.project ?? createBuyingProject() : null;
  const projectLabel = projectDraft ? tx("Ændringer ikke gemt", "Unsaved changes") : projectQuery.data?.project ? tx("Privat projektprofil", "Private project profile") : tx("Foreslået profil · ikke gemt", "Suggested profile · not saved");
  const assessments = assessmentsQuery.data?.assessments ?? [];
  const filtered = assessments.filter(({ assessment, property }) => (property?.address ?? assessment.propertyId).toLocaleLowerCase().includes(candidateSearch.trim().toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const activePage = Math.min(page, pages - 1);
  const visible = filtered.slice(activePage * PAGE_SIZE, (activePage + 1) * PAGE_SIZE);
  const selectedIds = selected.filter(id => assessments.some(item => item.assessment.propertyId === id));
  const focused = visible.find(item => item.assessment.propertyId === focusedId) ?? visible[0];
  // A page of six and at most four comparison selections bound the detail fan-out.
  const propertyIds = tab === "candidates" ? [...new Set([...visible.map(item => item.assessment.propertyId), ...selectedIds])] : [];
  const propertyQueries = useQueries({ queries: propertyIds.map(id => ({ queryKey: ["property", id], queryFn: () => getProperty(id), enabled: !!user, staleTime: 60_000 })) });
  const propertyQueryById = new Map(propertyIds.map((id, index) => [id, propertyQueries[index]!]));
  const focusedQuery = focused ? propertyQueryById.get(focused.assessment.propertyId) : undefined;
  const focusedProperty = focusedQuery?.data?.property;
  const focusedResult = project && focused && focusedProperty ? researchDecision(project, focusedProperty, focused.assessment) : null;
  const focusedBudget = focusedResult && focused ? focusedResult.budget[focused.assessment.budgetScenario] : null;

  function toggleCompare(id: string, checked: boolean) {
    setSelected(previous => {
      const current = previous.filter(value => assessments.some(item => item.assessment.propertyId === value));
      return checked ? [...new Set([...current, id])].slice(0, 4) : current.filter(value => value !== id);
    });
  }

  async function saveProject() {
    if (!project) return;
    setSaving(true);
    setMessage("");
    try {
      await saveResearchProject(project);
      await client.invalidateQueries({ queryKey: ["research-project", user?.id] });
      setProjectDraft(null);
      setMessage(tx("Profil gemt. Kandidater genberegnes med de nye krav.", "Profile saved. Candidates are recalculated with the new requirements."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tx("Profilen kunne ikke gemmes.", "Could not save the profile."));
    } finally {
      setSaving(false);
    }
  }

  const projectSummary = (
    <WorkspaceSection title={tx("Dit private projekt", "Your private project")}>
      {projectQuery.isPending ? <LoadingStatus>{tx("Henter projektprofil…", "Loading project profile…")}</LoadingStatus> : projectQuery.isError ? (
        <div role="alert"><p className="text-sm text-ink-soft">{tx("Projektprofilen kunne ikke hentes.", "Could not load the project profile.")}</p><button type="button" onClick={() => void projectQuery.refetch()} className="mt-3 text-sm font-semibold text-brand-text">{tx("Prøv igen", "Try again")}</button></div>
      ) : project && <>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-brand-text">{projectLabel}</p>
        <h3 className="break-words text-lg font-semibold text-ink">{project.name}</h3>
        <dl className="mt-4 space-y-3">
          <WorkspaceStat label={tx("Samlet projektloft", "Total project ceiling")} value={<Money value={project.totalBudget} />} />
          <div className="grid grid-cols-2 gap-2"><WorkspaceStat label={tx("Mindste boligareal", "Minimum living area")} value={`${project.minResidentialArea} m²`} /><WorkspaceStat label={tx("Lovlige soveværelser", "Legal bedrooms")} value={`${project.minBedrooms}+`} /></div>
        </dl>
        <p className="mb-2 mt-5 text-xs font-semibold text-ink-soft">{tx("Primære områder", "Primary areas")}</p>
        {project.primaryAreas.filter(area => area.trim()).length ? <div className="flex flex-wrap gap-1.5">{project.primaryAreas.filter(area => area.trim()).map((area, index) => <span key={`${area}-${index}`} className="rounded-full bg-surface-alt px-2.5 py-1.5 text-xs text-ink-soft">{area}</span>)}</div> : <p className="text-sm text-ink-faint">{tx("Ingen områder angivet", "No areas specified")}</p>}
        {tab !== "profile" && <button type="button" onClick={() => setTab("profile")} className="mt-5 text-sm font-semibold text-brand-text hover:underline">{tx("Rediger projektprofil", "Edit project profile")} <span aria-hidden="true">↗</span></button>}
      </>}
      <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-ink-faint">{tx("Din profil, noter og maksimale købspris er private.", "Your profile, notes and maximum purchase price are private.")}</p>
    </WorkspaceSection>
  );

  const comparisonToggle = <button type="button" className={comparison ? primaryClass : buttonClass} disabled={!comparison && selectedIds.length < 2} onClick={() => setComparison(value => !value)}>{comparison ? tx("Vis boligkort", "Show property cards") : tx("Sammenlign valgte", "Compare selected")}</button>;

  return <DashboardWorkspace
    title={tx("Mit boligprojekt", "My buying project")}
    description={tx("Fra bolig til fremvisning. Undersøg krav, samlet økonomi og dokumentation.", "From property to viewing. Research suitability, total project costs and documentation.")}
    actions={<Link to="/" className={primaryClass}>{tx("Find en bolig", "Find a property")} <span aria-hidden="true">↗</span></Link>}
    sidebar={<>
      <WorkspaceSection title={tx("Projektvisning", "Project view")}>
        <div className="space-y-1.5">{([
          ["candidates", "Kandidater", "Candidates"], ["profile", "Projektprofil", "Project profile"], ["statistics", "Statistik", "Statistics"], ["import", "Import", "Import"],
        ] as const).map(([id, da, en]) => <WorkspaceNavButton key={id} active={tab === id} onClick={() => setTab(id)} count={id === "candidates" && assessmentsQuery.isSuccess ? assessments.length : undefined}>{tx(da, en)}</WorkspaceNavButton>)}</div>
      </WorkspaceSection>
      {tab === "candidates" && <WorkspaceSection title={tx("Dine kandidater", "Your candidates")}>
        <label className="text-xs font-medium text-ink-soft" htmlFor="candidate-search">{tx("Søg i kandidater", "Search candidates")}</label>
        <input id="candidate-search" type="search" className={inputClass} placeholder={tx("Søg efter adresse", "Search by address")} value={candidateSearch} onChange={event => { setCandidateSearch(event.target.value); setPage(0); }} />
        {candidateSearch && <button type="button" className="mt-3 text-xs font-semibold text-brand-text" onClick={() => { setCandidateSearch(""); setPage(0); }}>{tx("Nulstil", "Reset")}</button>}
        <p className="mt-4 text-xs leading-5 text-ink-soft">{tx("Gem en undersøgelse på boligsiden for at tilføje en kandidat til projektet.", "Save research on a property page to add a candidate to the project.")}</p>
      </WorkspaceSection>}
      <WorkspaceSection title={tx("Næste skridt", "Next steps")}>
        <ol className="space-y-3 text-xs leading-5 text-ink-soft"><li><span className="mr-2 text-brand-text">01</span>{tx("Sæt dine krav i projektprofilen.", "Set your project requirements.")}</li><li><span className="mr-2 text-brand-text">02</span>{tx("Undersøg og gem interessante boliger.", "Research and save promising properties.")}</li><li><span className="mr-2 text-brand-text">03</span>{tx("Sammenlign 2–4 kandidater.", "Compare 2–4 candidates.")}</li></ol>
      </WorkspaceSection>
    </>}
    detail={tab === "candidates" && focused ? <div className="space-y-6">
      {focusedProperty ? <WorkspacePropertyPreview property={focusedProperty}>
        <h3 className="text-sm font-semibold text-ink">{tx("Match med dit projekt", "Match with your project")}</h3>
        {focusedResult && focusedBudget ? <>
          <p className="mt-1 text-[10px] text-ink-faint">{projectLabel}</p>
          <dl className="mt-4 space-y-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><dt>{tx("Krav", "Suitability")}</dt><dd><Status value={focusedResult.decision.suitability} /></dd></div><div className="flex flex-wrap items-center justify-between gap-2"><dt>{tx("Økonomi", "Economy")}</dt><dd><Status value={focusedResult.decision.economy} /></dd></div><div className="flex flex-wrap items-center justify-between gap-2"><dt>{tx("Dokumentation", "Documentation")}</dt><dd><Status value={focusedResult.decision.documentation} /></dd></div></dl>
          <dl className="mt-5 space-y-2"><WorkspaceStat label={tx("Maksimal købspris", "Maximum purchase price")} value={<Money value={focusedBudget.maxPurchasePrice} />} /><WorkspaceStat label={tx("Samlet projekt", "Total project")} value={<Money value={focusedBudget.projectTotal} />} /></dl>
          {focusedResult.budget.unknownItems.length > 0 && <p className="mt-3 text-xs leading-5 text-ink-soft">{tx("Ukendte budgetposter", "Unknown budget items")}: {focusedResult.budget.unknownItems.length}</p>}
        </> : <p className="mt-3 text-sm leading-6 text-ink-soft">{tx("Projektprofilen skal indlæses, før vi kan vurdere krav og økonomi.", "Load the project profile to assess requirements and costs.")}</p>}
      </WorkspacePropertyPreview> : focusedQuery?.isError ? <WorkspaceEmpty title={tx("Boligen kunne ikke indlæses", "Could not load property")} description={focused.property?.address ?? focused.assessment.propertyId} action={<button type="button" className={buttonClass} onClick={() => void focusedQuery.refetch()}>{tx("Prøv igen", "Try again")}</button>} /> : <><LoadingStatus>{tx("Henter bolig…", "Loading property…")}</LoadingStatus><Skeleton className="h-48 w-full rounded-xl" /></>}
      {projectSummary}
    </div> : projectSummary}
  >
    {tab === "candidates" && <>
      <form className="mb-6 rounded-2xl border border-border bg-surface p-4" onSubmit={event => { event.preventDefault(); setSearch(address.trim()); }}>
        <label htmlFor="research-address" className="mb-2 block text-xs font-semibold text-ink-soft">{tx("Undersøg en ny bolig", "Research a new property")}</label>
        <div className="flex flex-col gap-2 sm:flex-row"><input id="research-address" aria-label={tx("Find adresse eller annoncelink", "Find address or listing link")} className={`${inputClass} !mt-0 min-w-0`} value={address} onChange={event => setAddress(event.target.value)} placeholder={tx("Indtast adresse eller annoncelink…", "Enter address or listing link…")} /><button className={`${primaryClass} shrink-0`} type="submit" disabled={!address.trim()}>{tx("Undersøg bolig", "Research property")}</button></div>
      </form>
      {search && <div className="mb-5 rounded-xl border border-border bg-surface p-4">{searchQuery.isFetching && <LoadingStatus>{tx("Søger…", "Searching…")}</LoadingStatus>}{searchQuery.isError && <p role="alert" className="text-sm text-danger">{searchQuery.error.message}</p>}{(searchQuery.data?.properties ?? []).map(property => <Link className="block py-2 text-sm text-brand-text underline" key={property.id} to={`/property/${property.id}`}>{property.address}</Link>)}{searchQuery.data && !searchQuery.data.properties.length && <p className="text-sm text-ink-soft">{tx("Ingen registreret bolig fundet. Kun allerede indsamlede annoncer kan undersøges; prøv adressen.", "No stored property found. Research covers collected listings; try the address.")}</p>}</div>}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-tight text-ink">{tx("Dine kandidater", "Your candidates")}</h2><p className="mt-1 text-sm text-ink-soft">{tx("Boliger, du undersøger nærmere.", "Properties you are exploring in detail.")}</p></div>{comparisonToggle}</div>
      {assessmentsQuery.isPending ? <><LoadingStatus className="mb-4">{tx("Henter kandidater…", "Loading candidates…")}</LoadingStatus><div className="grid gap-5 sm:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <PropertyCardSkeleton key={index} />)}</div></> : assessmentsQuery.isError ? <WorkspaceEmpty title={tx("Kandidaterne kunne ikke hentes", "Could not load candidates")} description={tx("Prøv at hente dine projektdata igen.", "Try loading your project data again.")} action={<button type="button" className={buttonClass} onClick={() => void assessmentsQuery.refetch()}>{tx("Prøv igen", "Try again")}</button>} /> : assessments.length === 0 ? <WorkspaceEmpty title={tx("Din næste bolig starter her", "Your next property starts here")} description={tx("Åbn en bolig, undersøg den og gem din vurdering. Den bliver herefter en kandidat i dit projekt.", "Open a property, research it and save your assessment. It will then appear as a candidate in your project.")} action={<Link className={primaryClass} to="/">{tx("Find en kandidat", "Find a candidate")}</Link>} /> : <>
        <div className="mb-5 rounded-xl border border-border bg-surface px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-xs font-medium text-ink-soft">{tx(`${selectedIds.length} af 4 valgt til sammenligning`, `${selectedIds.length} of 4 selected for comparison`)}</p>{selectedIds.length > 0 && <button type="button" className="text-xs font-semibold text-brand-text" onClick={() => { setSelected([]); setComparison(false); }}>{tx("Ryd valg", "Clear selection")}</button>}</div>
          {selectedIds.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{selectedIds.map(id => <button key={id} type="button" aria-label={tx(`Fjern ${assessments.find(item => item.assessment.propertyId === id)?.property?.address ?? id} fra sammenligning`, `Remove ${assessments.find(item => item.assessment.propertyId === id)?.property?.address ?? id} from comparison`)} className="rounded-full bg-brand-soft px-2.5 py-1 text-xs text-brand-text" onClick={() => toggleCompare(id, false)}>{assessments.find(item => item.assessment.propertyId === id)?.property?.address ?? id} <span aria-hidden="true">×</span></button>)}</div>}
        </div>
        {comparison ? selectedIds.length < 2 ? <WorkspaceEmpty title={tx("Vælg mindst to kandidater", "Select at least two candidates")} description={tx("Vend tilbage til boligkortene og vælg 2–4 boliger til sammenligning.", "Return to the property cards and select 2–4 properties to compare.")} action={<button type="button" className={primaryClass} onClick={() => setComparison(false)}>{tx("Vis boligkort", "Show property cards")}</button>} /> : !project ? <WorkspaceEmpty title={tx("Projektprofil mangler", "Project profile unavailable")} description={tx("Projektprofilen skal indlæses, før kandidater kan sammenlignes.", "Load the project profile before comparing candidates.")} action={<button type="button" className={buttonClass} onClick={() => void projectQuery.refetch()}>{tx("Prøv igen", "Try again")}</button>} /> : (
          <section className="rounded-2xl border border-border bg-surface p-4">
            <h3 className="font-semibold text-ink">{tx("Sammenlign 2–4 kandidater", "Compare 2–4 candidates")}</h3><p className="mb-4 mt-1 text-xs text-ink-soft">{projectLabel}</p>
            <div className="overflow-x-auto" role="region" tabIndex={0} aria-label={tx("Kandidatsammenligning", "Candidate comparison")}><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-border"><th className="p-2">{tx("Bolig", "Property")}</th><th className="p-2">{tx("Areal / soveværelser", "Area / bedrooms")}</th><th className="p-2">{tx("Maks. køb / projekt", "Max purchase / project")}</th><th className="p-2">{tx("Nødvendigt ekstra afslag", "Required further reduction")}</th><th className="p-2">{tx("Krav / økonomi / ukendte", "Suitability / economy / unknowns")}</th></tr></thead><tbody>{selectedIds.map(id => {
              const query = propertyQueryById.get(id);
              const assessment = assessments.find(item => item.assessment.propertyId === id)?.assessment;
              if (!query?.data || !assessment) return <tr key={id}><td className="p-2" colSpan={5}>{query?.isError ? <><p role="alert">{query.error.message}</p><button type="button" className="mt-2 text-brand-text underline" onClick={() => void query.refetch()}>{tx("Prøv igen", "Try again")}</button></> : <LoadingStatus>{tx("Henter…", "Loading…")}</LoadingStatus>}</td></tr>;
              const { budget, decision } = researchDecision(project, query.data.property, assessment);
              const scenario = budget[assessment.budgetScenario];
              return <tr key={id} className="border-b border-border align-top"><td className="p-2"><Link className="font-semibold underline" to={`/property/${id}`}>{query.data.property.address}</Link></td><td className="p-2">{assessment.residentialArea ?? "?"} m² · {assessment.areaEvidence}<br />{assessment.legalBedrooms ?? "?"} · {assessment.bedroomEvidence}</td><td className="p-2"><Money value={scenario.maxPurchasePrice} /><br /><Money value={scenario.projectTotal} /></td><td className="p-2"><Money value={scenario.maxPurchasePrice === null ? null : Math.max(0, query.data.property.price - scenario.maxPurchasePrice)} /></td><td className="p-2"><div className="mb-2 flex flex-wrap gap-1"><Status value={decision.suitability} /><Status value={decision.economy} /></div>{decision.criteria.filter(criterion => criterion.status === "unknown").map(criterion => <p className="mb-1 text-xs" key={criterion.id}>{criterion.label}</p>)}{budget.unknownItems.length > 0 && <p className="text-xs">{tx("Ukendte budgetposter", "Unknown budget items")}: {budget.unknownItems.length}</p>}</td></tr>;
            })}</tbody></table></div>
          </section>
        ) : filtered.length === 0 ? <WorkspaceEmpty title={tx("Ingen kandidater matcher", "No matching candidates")} description={tx("Prøv en anden adresse, eller nulstil søgningen.", "Try another address or reset the search.")} action={<button type="button" className={buttonClass} onClick={() => { setCandidateSearch(""); setPage(0); }}>{tx("Vis alle kandidater", "Show all candidates")}</button>} /> : <>
          <div className="grid gap-5 sm:grid-cols-2">{visible.map(({ assessment, property: summary }) => {
            const query = propertyQueryById.get(assessment.propertyId);
            const property = query?.data?.property;
            const compareControl = <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-5 text-ink-soft"><input type="checkbox" className="mt-1 accent-brand" aria-label={tx(`Sammenlign ${property?.address ?? summary?.address ?? assessment.propertyId}`, `Compare ${property?.address ?? summary?.address ?? assessment.propertyId}`)} checked={selectedIds.includes(assessment.propertyId)} disabled={!selectedIds.includes(assessment.propertyId) && selectedIds.length >= 4} onChange={event => toggleCompare(assessment.propertyId, event.target.checked)} />{tx("Medtag i sammenligning", "Include in comparison")}</label>;
            return property ? <WorkspacePropertyCard key={assessment.propertyId} property={property} active={focused?.assessment.propertyId === assessment.propertyId} onPreview={() => setFocusedId(assessment.propertyId)}>{compareControl}</WorkspacePropertyCard> : query?.isError ? <div key={assessment.propertyId} className="rounded-2xl border border-border bg-surface p-4"><h3 className="font-semibold text-ink">{summary?.address ?? assessment.propertyId}</h3><p role="alert" className="my-3 text-xs text-ink-soft">{tx("Boligens detaljer kunne ikke indlæses.", "Could not load property details.")}</p><button type="button" className="mb-4 text-sm font-semibold text-brand-text" onClick={() => void query.refetch()}>{tx("Prøv igen", "Try again")}</button>{compareControl}<Link to={`/property/${assessment.propertyId}`} className="mt-3 block text-xs text-brand-text underline">{tx("Åbn bolig", "Open property")}</Link></div> : <div key={assessment.propertyId}><PropertyCardSkeleton /><LoadingStatus className="mt-3">{tx("Henter bolig…", "Loading property…")}</LoadingStatus></div>;
          })}</div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-ink-soft">{tx(`${activePage * PAGE_SIZE + 1}–${Math.min((activePage + 1) * PAGE_SIZE, filtered.length)} af ${filtered.length} kandidater`, `${activePage * PAGE_SIZE + 1}–${Math.min((activePage + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length} candidates`)}</p>{pages > 1 && <div className="flex gap-2"><button type="button" className={buttonClass} disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>{tx("Forrige", "Previous")}</button><button type="button" className={buttonClass} disabled={activePage >= pages - 1} onClick={() => setPage(activePage + 1)}>{tx("Næste", "Next")}</button></div>}</div>
        </>}
      </>}
    </>}

    {tab === "profile" && <>
      {projectQuery.isPending ? <><LoadingStatus>{tx("Henter projektprofil…", "Loading project profile…")}</LoadingStatus><Skeleton className="mt-4 h-48 w-full" /></> : projectQuery.isError ? <WorkspaceEmpty title={tx("Projektprofilen kunne ikke hentes", "Could not load the project profile")} description={tx("Prøv igen for at redigere din private profil.", "Try again to edit your private profile.")} action={<button type="button" className={buttonClass} onClick={() => void projectQuery.refetch()}>{tx("Prøv igen", "Try again")}</button>} /> : project && <><p className="mb-4 text-xs font-medium text-brand-text">{projectLabel}</p><ProjectEditor project={project} onChange={value => { setProjectDraft(value); setMessage(""); }} /></>}
      <button type="button" className={`${primaryClass} mt-4`} disabled={saving || !project} onClick={() => void saveProject()} aria-busy={saving}>{saving ? <span className="inline-flex items-center gap-2"><Spinner />{tx("Gemmer…", "Saving…")}</span> : tx("Gem privat profil", "Save private profile")}</button>
      {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    </>}
    {tab === "statistics" && <>
      {historyQuery.isError ? <WorkspaceEmpty title={tx("Salgshistorikken kunne ikke hentes", "Could not load sales history")} description={tx("Prøv at hente handlerne igen.", "Try loading transactions again.")} action={<button type="button" className={buttonClass} onClick={() => void historyQuery.refetch()}>{tx("Prøv igen", "Try again")}</button>} /> : historyQuery.isPending ? <><LoadingStatus>{tx("Henter salgshistorik…", "Loading sales history…")}</LoadingStatus><Skeleton className="mt-4 h-48 w-full" /></> : <>
        {historyQuery.data?.truncated && <p role="status" className="mb-3 text-sm text-warning-text">{tx("Delvist dataudtræk — statistikken dækker kun de hentede rækker.", "Partial extract — statistics cover retrieved rows only.")}</p>}
        <ResearchStatistics transactions={historyQuery.data?.transactions ?? []} dataVersion={historyQuery.data?.dataVersion ?? "unavailable"} minResidentialArea={project?.minResidentialArea} />
      </>}
    </>}
    {tab === "import" && <ResearchImportPanel onImported={() => { void historyQuery.refetch(); }} />}
  </DashboardWorkspace>;
}

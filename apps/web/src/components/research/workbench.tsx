import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createBuyingProject, estimateResearchPrice, summarizeResearchTransactions, type BuyingProject, type ResearchAssessment, type ResearchTimeDefinition } from "@shared/analysis";
import type { Property } from "@shared/types/index";
import type { ResearchAssessmentResponse, ResearchHistoryResponse } from "@shared/types/research-api";
import { useAuth } from "@/hooks/use-auth";
import { useListingHistory } from "@/hooks/use-listing-history";
import { getResearchAssessment, getResearchMarketHistory, getResearchProject, saveResearchAssessment, saveResearchProject } from "@/lib/research-api";
import { downloadSnapshot, newAssessment, researchDecision } from "@/lib/research-view";
import { researchListingTime } from "@/lib/research-listing-time";
import type { MergedPropertyFacts } from "@/lib/property-facts";
import { ListingEvidenceOverview } from "./listing-evidence";
import { ProjectEditor } from "./project-editor";
import { BudgetEditor } from "./budget-editor";
import { EvidenceEditor } from "./evidence-editor";
import { BrokerEditor } from "./broker-editor";
import { HistoryPanel } from "./history-panel";
import { ResearchStatistics } from "./statistics";
import { PriceReferencePanel, PriceReferencePrint } from "./price-reference";
import { buttonClass, Money, Panel, primaryClass, Status, useResearchText } from "./fields";

export function ResearchWorkbench({ property, facts }: { property: Property; facts?: MergedPropertyFacts }) {
  const { user } = useAuth(); const tx = useResearchText();
  const project = useQuery({ queryKey: ["research-project", user?.id], queryFn: getResearchProject, enabled: !!user });
  const assessment = useQuery({ queryKey: ["research-assessment", user?.id, property.id], queryFn: () => getResearchAssessment(property.id), enabled: !!user });
  const history = useListingHistory(property.id);
  const market = useQuery({ queryKey: ["research-market", user?.id, property.id], queryFn: () => getResearchMarketHistory(property.id), enabled: !!user });
  if (project.isPending || assessment.isPending) return <div className="my-5 space-y-4"><ListingEvidenceOverview property={property} facts={facts} history={history.data} listing={researchListingTime(property, history.data)} /><section className="animate-pulse rounded-2xl bg-surface p-6">{tx("Henter privat boligundersøgelse…", "Loading private research…")}</section></div>;
  if (project.isError || assessment.isError) return <div className="my-5 space-y-4"><ListingEvidenceOverview property={property} facts={facts} history={history.data} listing={researchListingTime(property, history.data)} /><section className="rounded-2xl border border-warning bg-surface p-5"><h2 className="font-bold">{tx("Boligundersøgelsen kunne ikke hentes", "Research could not be loaded")}</h2><p className="my-2 text-sm">{String(project.error?.message ?? assessment.error?.message)}</p><button className={buttonClass} onClick={() => { void project.refetch(); void assessment.refetch(); }}>{tx("Prøv igen", "Retry")}</button></section></div>;
  return <ResearchEditor key={`${user?.id}-${property.id}`} property={property} facts={facts} initialHasProject={Boolean(project.data.project)} initialHasAssessment={Boolean(assessment.data.assessment)} initialProject={project.data.project ?? createBuyingProject()} initialAssessment={assessment.data.assessment ?? newAssessment(property.id)} revisions={assessment.data.revisions} history={history.data} market={market.data} historyFailed={history.isError || market.isError} historyLoading={history.isPending || market.isPending} />;
}

function ResearchEditor({ property, facts, initialHasProject, initialHasAssessment, initialProject, initialAssessment, revisions, history, market, historyFailed, historyLoading }: {
  facts?: MergedPropertyFacts; initialHasProject: boolean; initialHasAssessment: boolean;
  property: Property; initialProject: BuyingProject; initialAssessment: ResearchAssessment;
  revisions: ResearchAssessmentResponse["revisions"]; history?: ResearchHistoryResponse; market?: ResearchHistoryResponse; historyFailed: boolean; historyLoading: boolean;
}) {
  const tx = useResearchText(); const { user } = useAuth(); const client = useQueryClient();
  const [project, setProject] = useState(initialProject);
  const [assessment, setAssessment] = useState(initialAssessment);
  const [hasPersonalProject, setHasPersonalProject] = useState(initialHasProject);
  const [tab, setTab] = useState("overview");
  const [priceTimeDefinition, setPriceTimeDefinition] = useState<ResearchTimeDefinition>("latest_episode_days");
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState(""); const [dirty, setDirty] = useState(false);
  const { budget, decision, purchase } = researchDecision(project, property, assessment);
  const hasPersonalResult = [decision.suitability, decision.economy, decision.documentation].some(status => status !== "unknown");
  const [workspaceOpen, setWorkspaceOpen] = useState((initialHasProject || initialHasAssessment) && hasPersonalResult);
  const chosen = budget[assessment.budgetScenario];
  const setA = (v: ResearchAssessment) => { setAssessment(v); setDirty(true); setMessage(""); };
  const setP = (v: BuyingProject) => { setProject(v); setDirty(true); setMessage(""); };
  const nextActions = { viewing: tx("Relevant til fremvisning", "Ready for a viewing"), clarify_price: tx("Afklar pris først", "Clarify price first"), clarify_documents: tx("Afklar dokumentation først", "Clarify documents first"), rejected: tx("Fravalgt", "Rejected") };
  const tabs = [["overview", "Overblik", "Overview"], ["history", "Pris og historik", "Price and history"], ["comparisons", "Sammenligninger", "Comparisons"], ["budget", "Projektbudget", "Project budget"], ["evidence", "Stand og dokumentation", "Condition and documents"], ["area", "Område", "Area"], ["dialogue", "Mæglerdialog", "Agent discussion"], ["project", "Projektprofil", "Project profile"]];
  const reference = summarizeResearchTransactions(market?.transactions ?? [], { propertyTypes: [property.propertyType], municipality: property.municipality, minArea: project.minResidentialArea, timeDefinition: "latest_episode_days", dataVersion: market?.dataVersion ?? "unavailable", calculatedAt: new Date().toISOString(), excludedTransactionIds: assessment.comparables.filter(s => !s.included).map(s => s.transactionId) });
  const listing = researchListingTime(property, history);
  const priceReference = estimateResearchPrice({
    subject: {
      propertyId: property.id, propertyType: property.propertyType, municipality: property.municipality,
      residentialArea: assessment.residentialArea ?? property.sqm,
      areaEvidence: assessment.residentialArea === null ? "reported" : assessment.areaEvidence,
      dataMode: property.dataMode === "real" && property.status === "active" ? "live" : "unavailable",
      firstAsking: listing.firstAsking, firstAskingDocumented: listing.firstAsking !== null,
      daysOnMarket: priceTimeDefinition === "active_days" ? listing.time.activeDays : priceTimeDefinition === "calendar_days" ? listing.time.calendarDays : listing.time.latestEpisodeDays,
      daysOnMarketSource: priceTimeDefinition === "latest_episode_days" ? listing.latestEpisodeSource : null,
      timeDefinition: priceTimeDefinition,
    },
    transactions: market?.transactions ?? [], excludedTransactionIds: assessment.comparables.filter(s => !s.included).map(s => s.transactionId),
    dataVersion: market?.dataVersion ?? "unavailable", calculatedAt: history?.retrievedAt ?? market?.retrievedAt ?? new Date().toISOString(),
    partialDataset: historyFailed || history?.truncated || market?.truncated,
  });
  const lastObserved = revisions[0]?.propertySnapshot;
  const priceChanged = !!lastObserved && lastObserved.price !== property.price;
  const statusChanged = !!lastObserved && lastObserved.status !== property.status;
  const openQuestions = [...decision.criteria.filter(c => c.status === "unknown").map(c => c.reason), ...assessment.questions.filter(q => !q.resolved).map(q => q.text).filter(Boolean)];
  async function save() {
    setSaving(true); setMessage("");
    try {
      await saveResearchProject(project);
      await saveResearchAssessment(assessment);
      await Promise.all([client.invalidateQueries({ queryKey: ["research-project", user?.id] }), client.invalidateQueries({ queryKey: ["research-assessment", user?.id, property.id] }), client.invalidateQueries({ queryKey: ["research-assessments", user?.id] })]);
      setDirty(false); setHasPersonalProject(true); setMessage(tx("Gemt privat. Beslutningen er arkiveret som en ny version.", "Saved privately. The decision has been archived as a new revision."));
    } catch (e) { setMessage(e instanceof Error ? e.message : tx("Kunne ikke gemme", "Could not save")); }
    finally { setSaving(false); }
  }
  const snapshot = () => ({ exportedAt: new Date().toISOString(), private: true, saved: !dirty, property: { ...property }, listingFacts: facts, project, assessment, decision, budget, history, listingTime: listing, priceReference, analysis: reference, sourceData: market?.transactions.filter(t => reference.snapshot.transactionIds.includes(t.id)) ?? [] });
  return <section id="research" className="my-5" aria-label={tx("Boligundersøgelse", "Property research")}>
    <div className="research-screen space-y-4">
      <ListingEvidenceOverview property={property} facts={facts} history={history} listing={listing} />
      <PriceReferencePanel result={priceReference} scope={market?.marketScope} property={property} listing={listing} definition={priceTimeDefinition} onDefinition={setPriceTimeDefinition} loading={historyLoading} failed={historyFailed} onUsePrice={value => { setA({ ...assessment, selectedPurchasePrice: value }); setWorkspaceOpen(true); setTab("budget"); }} />
      {!hasPersonalProject && <section data-testid="research-project-setup" className="rounded-2xl border border-border bg-surface p-5"><h2 className="text-lg font-bold">{tx("Sammenlign med dit eget budget og dine krav", "Compare with your own budget and requirements")}</h2><p className="mt-2 text-sm text-ink-soft">{tx("Du har ikke oprettet et boligprojekt endnu. Angiv dine egne krav og omkostninger for at få en privat vurdering af netop denne bolig.", "You have not set up a buying project yet. Add your requirements and costs to get a personal assessment of this home.")}</p><button className={`${buttonClass} mt-3`} onClick={() => { setWorkspaceOpen(true); setTab("project"); }}>{tx("Tilpas dit boligprojekt", "Set up your buying project")}</button>{workspaceOpen && <p className="mt-3 text-xs text-ink-soft">{tx("Felterne starter med forslag. Tilpas dem, før du gemmer dit private projekt.", "The fields start with suggested values. Adjust them before saving your private project.")}</p>}</section>}
      {hasPersonalProject && !hasPersonalResult && <section data-testid="research-project-incomplete" className="rounded-2xl border border-border bg-surface p-5"><h2 className="text-lg font-bold">{tx("Din private boligundersøgelse", "Your private property research")}</h2><p className="mt-2 text-sm text-ink-soft">{tx("Dit boligprojekt er gemt. Tilføj dokumentation for dine krav og afklar budgetposter for at vurdere denne bolig ud fra dit projekt.", "Your buying project is saved. Add evidence for your requirements and clarify costs to assess this home against your project.")}</p><div className="mt-3 flex flex-wrap gap-2"><button className={buttonClass} aria-expanded={workspaceOpen} aria-controls="research-workspace" onClick={() => { setWorkspaceOpen(!workspaceOpen); if (!workspaceOpen) setTab("evidence"); }}>{workspaceOpen ? tx("Skjul privat undersøgelse", "Hide private research") : tx("Åbn din private undersøgelse", "Open your private research")}</button><button className={buttonClass} onClick={() => { setWorkspaceOpen(true); setTab("project"); }}>{tx("Rediger boligprojekt", "Edit buying project")}</button></div></section>}
      {hasPersonalProject && hasPersonalResult && <div data-testid="research-personal-result" className="rounded-2xl border border-border-strong bg-surface p-5 shadow-card"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="ds-mono text-[10px] text-ink-soft">{tx("Din private vurdering · før fremvisning", "Your personal assessment · before viewing")}</p><h2 className="mt-2 text-2xl font-bold tracking-tight">{nextActions[decision.nextAction]}</h2><p className="mt-2 max-w-2xl text-sm text-ink-soft">{decision.reason}</p></div><Link className={buttonClass} to="/research">{tx("Statistik og kandidater", "Statistics and candidates")} ↗</Link></div>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3"><div className="rounded-xl bg-surface-alt p-3"><p className="mb-2 text-xs font-semibold">{tx("Familiekrav", "Family requirements")}</p><Status value={decision.suitability} /></div><div className="rounded-xl bg-surface-alt p-3"><p className="mb-2 text-xs font-semibold">{tx("Økonomi i valgt scenario", "Economy in selected scenario")}</p><Status value={decision.economy} /><p className="mt-2 text-sm"><Money value={chosen.projectTotal} /></p></div><div className="rounded-xl bg-surface-alt p-3"><p className="mb-2 text-xs font-semibold">{tx("Dokumentation", "Documentation")}</p><Status value={decision.documentation} /></div></div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3"><p>{tx("Udbud", "Asking")}: <strong><Money value={property.price} /></strong><br /><span className="text-xs text-ink-soft">{property.updatedAt.slice(0, 10)}</span></p><p>{tx("Afstand til projektloft", "Project headroom")}: <strong><Money value={chosen.headroom} /></strong></p><p>{tx("Privat maksimal købspris", "Private maximum purchase price")}: <strong><Money value={chosen.maxPurchasePrice} /></strong></p></div>

      <div className="mt-4 flex flex-wrap items-center gap-2"><button className={primaryClass} disabled={saving} onClick={save}>{saving ? tx("Gemmer…", "Saving…") : tx("Gem projekt og undersøgelse", "Save project and research")}</button><button className={buttonClass} onClick={() => window.print()}>{tx("Print fremvisningspakke", "Print viewing pack")}</button><button className={buttonClass} onClick={() => downloadSnapshot(snapshot(), `boligdata-${property.id}.json`)}>{tx("Gem snapshot", "Download snapshot")}</button>{dirty && <span className="text-xs text-warning-text">{tx("Ugemte ændringer", "Unsaved changes")}</span>}</div>{message && <p role="status" className="mt-3 text-sm">{message}</p>}</div>}
      {(priceChanged || statusChanged) && <Panel title={tx("Ændringer siden din seneste beslutning", "Changes since your last decision")}>
        {priceChanged && <p className="text-sm">{tx("Udbudsprisen er ændret fra", "Asking price changed from")} <Money value={lastObserved!.price} /> {tx("til", "to")} <Money value={property.price} />. {tx("Nødvendigt ekstra afslag til dit valgte budget er nu", "The further reduction required for your selected budget is now")} <Money value={chosen.maxPurchasePrice === null ? null : Math.max(0, property.price - chosen.maxPurchasePrice)} />.</p>}
        {statusChanged && <p className="mt-2 text-sm">{tx("Annoncestatus", "Listing status")}: {lastObserved!.status} → {property.status}.</p>}
        <p className="mt-2 text-xs text-ink-soft">{tx("Tidligere noter og beregninger findes i beslutningshistorikken.", "Previous notes and calculations remain in decision history.")}</p>
      </Panel>}
      {(historyFailed || history?.truncated || market?.truncated) && <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning-text">{tx("Historik eller markedsgrundlag er utilgængeligt eller ufuldstændigt. Tallene beskriver kun det hentede udvalg.", "History or market coverage is unavailable or incomplete. Figures describe only the retrieved selection.")}</p>}
      {workspaceOpen && <div id="research-workspace" className="space-y-4">
      {(!hasPersonalProject || !hasPersonalResult) && <div><button className={primaryClass} disabled={saving} onClick={save}>{saving ? tx("Gemmer…", "Saving…") : tx("Gem projekt og undersøgelse", "Save project and research")}</button>{dirty && <span className="ml-3 text-xs text-warning-text">{tx("Ugemte ændringer", "Unsaved changes")}</span>}{message && <p role="status" className="mt-2 text-sm">{message}</p>}</div>}
      <div className="flex flex-wrap gap-1" role="tablist" aria-label={tx("Undersøgelsens dele", "Research sections")}>{tabs.map(([id, da, en]) => <button key={id} role="tab" id={`research-tab-${id}`} aria-controls={`research-panel-${tab}`} aria-selected={tab === id} className={tab === id ? primaryClass : buttonClass} onClick={() => setTab(id!)}>{tx(da!, en!)}</button>)}</div>
      <div role="tabpanel" id={`research-panel-${tab}`} aria-labelledby={`research-tab-${tab}`}>
        {tab === "overview" && <div className="space-y-4"><Panel title={tx("Krav og begrundelser", "Requirements and reasons")}><ul className="space-y-4">{decision.criteria.map(c => <li key={c.id} className="flex items-start justify-between gap-4 border-b border-border pb-3"><div><p className="font-semibold">{c.label}</p><p className="mt-1 text-sm text-ink-soft">{c.reason}</p></div><Status value={c.status} /></li>)}</ul></Panel><Panel title={tx("Vigtigste åbne spørgsmål", "Key open questions")}><ul className="list-disc space-y-2 pl-5 text-sm">{openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>{openQuestions.length === 0 && <p className="text-sm">{tx("Ingen åbne spørgsmål er registreret.", "No open questions recorded.")}</p>}<button className={`${buttonClass} mt-4`} onClick={() => setTab("evidence")}>{tx("Arbejd med dokumentation", "Review documentation")}</button></Panel><Panel title={tx("Beslutningshistorik", "Decision history")}><p className="mb-3 text-sm text-ink-soft">{tx("Gemte versioner bevarer de daværende krav og budgetposter. Nye oplysninger ændrer ikke tidligere snapshots.", "Saved revisions retain their original requirements and costs. New information does not change older snapshots.")}</p>{revisions.map(r => <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm" key={r.id}><span>#{r.revision} · {r.createdAt}</span><button className="underline" onClick={() => downloadSnapshot(r, `boligdata-beslutning-${r.revision}.json`)}>{tx("Hent tidligere grundlag", "Download previous basis")}</button></div>)}</Panel></div>}
        {tab === "project" && <ProjectEditor project={project} onChange={setP} />}
        {tab === "budget" && <BudgetEditor project={project} assessment={assessment} askingPrice={property.price} onChange={setA} />}
        {tab === "evidence" && <EvidenceEditor property={property} assessment={assessment} onChange={setA} />}
        {tab === "history" && <HistoryPanel property={property} history={history} assessment={assessment} budget={budget} />}
        {tab === "comparisons" && <ResearchStatistics transactions={market?.transactions ?? []} dataVersion={market?.dataVersion ?? "unavailable"} propertyType={property.propertyType} minResidentialArea={project.minResidentialArea} selections={assessment.comparables} onSelections={comparables => setA({ ...assessment, comparables })} />}
        {tab === "dialogue" && <BrokerEditor address={property.address} assessment={assessment} decision={decision} onChange={setA} />}
        {tab === "area" && <Panel title={tx("Område og særlige ejendomme", "Area and special properties")}><p className="mb-3 text-sm">{tx("Ukendt støj betyder ikke stille. Hold eksisterende støj, fremtidige anlæg, skoledistrikt, planforhold og personlige fravalg adskilt med kilde og dato.", "Unknown noise does not mean quiet. Keep existing noise, future infrastructure, school district, planning and personal exclusions separate, with sources and dates.")}</p><ul className="list-disc space-y-2 pl-5 text-sm">{[tx("Flerfamiliehus: dokumentér annoncerede, registrerede og faktiske boligenheder.", "Multi-family house: document advertised, registered and actual units."), tx("Afklar udlejning, rådighed, tilladelser og mulig anvendelse før fremvisning.", "Clarify tenancy, availability, permits and intended use before viewing."), tx("Et muligt delsalg er en idé, ikke et sikkert fradrag i projektbudgettet.", "A potential partial sale is an idea, not a guaranteed budget deduction.")].map(s => <li key={s}>{s}</li>)}</ul><button className={`${buttonClass} mt-4`} onClick={() => { setA({ ...assessment, questions: [...assessment.questions, ...["Dokumentation for støj og fremtidige anlæg?", "Hvilket skoledistrikt og hvilke planforhold gælder?", "Antal lovlige boligenheder, rådighed og udlejning?"].filter(text => !assessment.questions.some(q => q.text === text)).map(text => ({ id: crypto.randomUUID(), text, resolved: false }))] }); setTab("evidence"); }}>{tx("Tilføj områdespørgsmål", "Add area questions")}</button></Panel>}
      </div></div>}
    </div>
    {hasPersonalProject && hasPersonalResult && <article className="research-print hidden"><h1>{tx("Privat fremvisningspakke", "Private viewing pack")} — {property.address}</h1><p>{new Date().toISOString()} · {dirty ? tx("Ugemt kladde", "Unsaved draft") : tx("Aktuelt grundlag", "Current basis")} · {market?.dataVersion ?? "unknown"}</p><h2>{nextActions[decision.nextAction]}</h2><p>{decision.reason}</p><h3>{tx("Familiekrav", "Family requirements")}</h3><p>{project.minResidentialArea} m² · {project.minBedrooms} {tx("soveværelser", "bedrooms")} · {project.acceptedPropertyTypes.join(", ")}</p><ul>{decision.criteria.map(c => <li key={c.id}>{c.label}: {c.status} — {c.reason}</li>)}</ul><h3>{tx("Privat projektbudget", "Private project budget")}</h3><p>{tx("Projektloft", "Ceiling")}: <Money value={project.totalBudget} /> · {assessment.budgetScenario}</p><p>{tx("Valgt køb / samlet projekt / maks. køb", "Chosen purchase / total project / max purchase")}: <Money value={purchase} /> / <Money value={chosen.projectTotal} /> / <Money value={chosen.maxPurchasePrice} /></p><ul>{assessment.budgetItems.map(b => <li key={b.id}>{b.label}: <Money value={b.low} /> – <Money value={b.high ?? b.low} /> · {b.vat} · {b.status} · {b.source} · {b.observedAt}</li>)}</ul><PriceReferencePrint result={priceReference} /><h3>{tx("Prisforløb", "Price history")}</h3><ul>{(history?.events ?? []).map(e => <li key={e.id}>{e.eventDate ?? "?"} · {e.datePrecision} · {e.eventType}: <Money value={e.price} /> · {e.source}</li>)}</ul><h3>{tx("Udvalgte sammenligninger", "Selected comparisons")}</h3><p>{reference.warnings.join(" ")}</p><ul>{reference.transactions.filter(t => assessment.comparables.some(s => s.transactionId === t.id && s.included)).slice(0, 5).map(t => <li key={t.id}>{t.address} · {t.saleDate} · <Money value={t.soldPrice} /> · {t.residentialArea ?? "?"} m² ({t.areaDefinition}) · {t.source}</li>)}</ul><h3>{tx("Spørgsmål og ønskede dokumenter", "Questions and requested documents")}</h3><ul>{openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul><ul>{assessment.documents.map(d => <li key={d.id}>{d.title} · {d.reference} · {d.status} · {d.source} · {d.url}</li>)}</ul><p style={{ whiteSpace: "pre-wrap" }}>{assessment.notes}</p></article>}
  </section>;
}

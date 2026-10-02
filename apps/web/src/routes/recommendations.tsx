import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listMyConnections } from "@/lib/api";
import { useReceivedRecommendations, useSentRecommendations } from "@/hooks/use-recommendations";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useToast } from "@/components/toast";
import { LoadingStatus, Skeleton, Spinner } from "@/components/ui/loading";
import {
  DashboardWorkspace,
  WorkspaceEmpty,
  WorkspaceNavButton,
  WorkspacePropertyCard,
  WorkspacePropertyPreview,
  WorkspaceSection,
} from "@/components/dashboard/workspace";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import type { ListingRecommendation, Property } from "@shared/types/index";

type RecommendationStatus = ListingRecommendation["status"];
type RecommendationFilter = "all" | RecommendationStatus;

const STATUS_LABEL: Record<RecommendationStatus, TranslationKey> = {
  pending: "recommend.status.pending",
  accepted: "recommend.status.accepted",
  dismissed: "recommend.status.dismissed",
};

const STATUS_STYLE: Record<RecommendationStatus, string> = {
  pending: "bg-warning-soft text-warning-text",
  accepted: "bg-success-soft text-success-text",
  dismissed: "bg-danger-soft text-danger",
};

export function RecommendationsPage() {
  const { t, language } = useI18n();
  const { profile, loading, error } = useUserProfile();

  // Keep role-specific queries unmounted until the profile is known.
  if (loading || error) {
    return <DashboardWorkspace
      title={t("recommend.pageTitle")}
      description={language === "da" ? "Boliger og dialog samlet ét sted." : "Homes and conversations in one place."}
      sidebar={<WorkspaceSection title={language === "da" ? "Anbefalinger" : "Recommendations"}><Skeleton className="h-32 w-full" /></WorkspaceSection>}
      detail={<WorkspaceEmpty title={language === "da" ? "Bolig og dialog" : "Home and conversation"} description={language === "da" ? "Her finder du detaljer og svar på dine anbefalinger." : "Find the details and replies for your recommendations here."} />}
    >
      {loading ? <RecommendationsLoading /> : <div className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
        <p role="alert">{t("roleGuard.loadError")}</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-2 font-semibold underline underline-offset-4">{t("common.retry")}</button>
      </div>}
    </DashboardWorkspace>;
  }

  return profile?.role === "advisor" || profile?.role === "agent"
    ? <SentRecommendations />
    : <ReceivedRecommendations />;
}

function RecommendationsLoading() {
  const { t } = useI18n();
  return <div>
    <LoadingStatus className="mb-4 text-ink-soft">{t("dashboard.loading")}</LoadingStatus>
    <div className="grid gap-4 sm:grid-cols-2" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => <div key={index} className="rounded-2xl border border-border bg-surface p-3">
        <Skeleton className="aspect-[8/5] w-full rounded-xl" />
        <Skeleton className="mt-4 h-5 w-2/3" />
        <Skeleton className="mt-3 h-3 w-1/3" />
        <Skeleton className="mt-4 h-9 w-full" />
      </div>)}
    </div>
  </div>;
}

function RecommendationsError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  const { t, language } = useI18n();
  return <div className="ui-enter mb-4 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
    <p role="alert">{language === "da" ? "Kunne ikke indlæse anbefalinger." : "Could not load recommendations."}</p>
    <button type="button" onClick={onRetry} disabled={retrying} className="mt-2 inline-flex items-center gap-2 font-semibold underline underline-offset-4 disabled:opacity-50">
      {retrying && <Spinner />}{retrying ? t("dashboard.loading") : t("common.retry")}
    </button>
  </div>;
}

function StatusBadge({ status }: { status: RecommendationStatus }) {
  const { t } = useI18n();
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${STATUS_STYLE[status]}`}>{t(STATUS_LABEL[status])}</span>;
}

interface RecommendationsWorkspaceProps {
  mode: "received" | "sent";
  recommendations: ListingRecommendation[];
  properties: Property[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  renderResponse?: (recommendation: ListingRecommendation) => ReactNode;
}

function RecommendationsWorkspace({ mode, recommendations, properties, isLoading, isError, isFetching, onRetry, renderResponse }: RecommendationsWorkspaceProps) {
  const { t, language } = useI18n();
  const isSent = mode === "sent";
  const [filter, setFilter] = useState<RecommendationFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const connectionsQuery = useQuery({ queryKey: ["connections", "mine"], queryFn: listMyConnections });
  const propertiesById = new Map(properties.map((property) => [property.id, property]));
  const connectionsById = new Map((connectionsQuery.data?.connections ?? []).map((connection) => [connection.otherUserId, connection]));
  const dateLocale = language === "da" ? "da-DK" : "en-GB";
  const query = search.trim().toLocaleLowerCase(dateLocale);
  const unavailableTitle = language === "da" ? "Boligen er ikke tilgængelig" : "Property unavailable";

  function contactLabel(rec: ListingRecommendation) {
    const connection = connectionsById.get(isSent ? rec.userId : rec.advisorId);
    const name = connection?.otherUserEmail || connection?.otherUserOrganizationName;
    if (isSent) return name ? t("recommend.sentTo", { email: name }) : language === "da" ? "Sendt til kunde" : "Sent to client";
    return name ? `${language === "da" ? "Fra" : "From"} ${name}` : language === "da" ? "Fra din rådgiver" : "From your advisor";
  }

  const visible = recommendations.filter((rec) => {
    if (filter !== "all" && rec.status !== filter) return false;
    const property = propertiesById.get(rec.propertyId);
    return !query || [property?.address, property?.municipality, property?.postalCode, rec.message, rec.responseMessage, contactLabel(rec)]
      .filter(Boolean).join(" ").toLocaleLowerCase(dateLocale).includes(query);
  });
  const selected = visible.find((rec) => rec.id === selectedId) ?? visible[0];
  const selectedProperty = selected ? propertiesById.get(selected.propertyId) : undefined;
  const filters: RecommendationFilter[] = ["all", "pending", "accepted", "dismissed"];
  const countFor = (status: RecommendationFilter) => status === "all" ? recommendations.length : recommendations.filter((rec) => rec.status === status).length;
  const hasFilters = filter !== "all" || search.trim().length > 0;

  function resetFilters() {
    setFilter("all");
    setSearch("");
  }

  function previewUnavailable(id: string) {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 1199px)").matches) {
      const panel = document.getElementById("workspace-detail");
      panel?.focus({ preventScroll: true });
      panel?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    }
  }

  const selectedConversation = selected && <div data-testid={`recommendation-detail-${selected.id}`} className="space-y-5">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-ink">{language === "da" ? "Anbefalingen" : "Recommendation"}</h3>
      <StatusBadge status={selected.status} />
    </div>
    <div className="rounded-2xl bg-surface-alt p-4">
      <p className="break-words text-xs font-medium text-ink">{contactLabel(selected)}</p>
      <p className="mt-1 text-[11px] text-ink-faint">{new Date(selected.createdAt).toLocaleDateString(dateLocale)}</p>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-ink-soft">{selected.message || (language === "da" ? "Denne bolig blev anbefalet uden en besked." : "This home was recommended without a message.")}</p>
    </div>
    {renderResponse ? renderResponse(selected) : <RecommendationReply recommendation={selected} isSent />}
  </div>;

  const detail = selected ? selectedProperty
    ? <WorkspacePropertyPreview property={selectedProperty}>{selectedConversation}</WorkspacePropertyPreview>
    : <div className="space-y-5">
      <WorkspaceEmpty title={unavailableTitle} description={language === "da" ? "Boligens oplysninger kan ikke vises. Du kan stadig læse anbefalingen og se dialogen her." : "The property details cannot be displayed. You can still read the recommendation and conversation here."} />
      {selectedConversation}
    </div>
    : <WorkspaceEmpty title={language === "da" ? "Bolig og dialog" : "Home and conversation"} description={language === "da" ? "Vælg en anbefaling for at se boligen, læse beskeden og følge op." : "Select a recommendation to view the home, read the message and follow up."} />;

  return <DashboardWorkspace
    title={t("recommend.pageTitle")}
    description={isSent
      ? language === "da" ? "Følg dine anbefalede boliger og kundernes svar." : "Follow your recommended homes and your clients’ replies."
      : language === "da" ? "Udforsk boliger fra din rådgiver, og find dit næste skridt." : "Explore homes from your advisor and find your next step."}
    actions={isSent ? <Link to="/" className="inline-flex items-center rounded-full bg-cta px-4 py-2.5 text-xs font-semibold text-cta-text transition-colors hover:bg-cta-hover">{language === "da" ? "Find boliger at anbefale" : "Find homes to recommend"}</Link> : undefined}
    sidebar={<div className="space-y-6">
      <WorkspaceSection title={isSent ? language === "da" ? "Sendte anbefalinger" : "Sent recommendations" : language === "da" ? "Modtagne anbefalinger" : "Received recommendations"}>
        <div className="space-y-1">
          {filters.map((status) => <WorkspaceNavButton key={status} active={filter === status} onClick={() => setFilter(status)} count={isLoading || (isError && recommendations.length === 0) ? undefined : countFor(status)}>
            {status === "all" ? language === "da" ? "Alle anbefalinger" : "All recommendations" : t(STATUS_LABEL[status])}
          </WorkspaceNavButton>)}
        </div>
      </WorkspaceSection>
      <WorkspaceSection title={language === "da" ? "Find en anbefaling" : "Find a recommendation"}>
        <label htmlFor="recommendation-search" className="mb-2 block text-xs text-ink-soft">{language === "da" ? "Søg i anbefalinger" : "Search recommendations"}</label>
        <input id="recommendation-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={language === "da" ? "Adresse, kontakt eller besked" : "Address, contact or message"} className="w-full rounded-xl border border-border bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint" />
        {hasFilters && <button type="button" onClick={resetFilters} className="mt-3 text-xs font-medium text-brand-text underline underline-offset-4">{language === "da" ? "Nulstil filtre" : "Reset filters"}</button>}
      </WorkspaceSection>
      <div className="rounded-2xl bg-surface-alt p-4 text-xs leading-5 text-ink-soft">
        <p className="mb-1 font-semibold text-ink">{language === "da" ? "Hold dialogen samlet" : "Keep the conversation together"}</p>
        <p>{isSent
          ? language === "da" ? "Vælg en bolig for at se din besked og kundens svar." : "Select a home to see your message and your client’s reply."
          : language === "da" ? "Vælg en bolig, læs anbefalingen, og send dit svar til din rådgiver." : "Select a home, read the recommendation and send your reply to your advisor."}</p>
      </div>
    </div>}
    detail={detail}
  >
    {isError && <RecommendationsError onRetry={onRetry} retrying={isFetching} />}
    {isLoading ? <RecommendationsLoading /> : recommendations.length === 0 ? !isError && <WorkspaceEmpty
      title={t(isSent ? "recommend.sentEmpty" : "recommend.receivedEmpty")}
      description={isSent
        ? language === "da" ? "Find relevante boliger, og send dem til dine kunder fra boligsøgningen." : "Find relevant homes and send them to your clients from property search."
        : language === "da" ? "Når din rådgiver anbefaler en bolig, finder du den og beskeden her." : "When your advisor recommends a home, you’ll find it and their message here."}
      action={<Link to="/" className="inline-flex rounded-full bg-cta px-4 py-2.5 text-xs font-semibold text-cta-text hover:bg-cta-hover">{language === "da" ? "Udforsk boliger" : "Explore homes"}</Link>}
    /> : <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{isSent ? language === "da" ? "Anbefalet til dine kunder" : "Recommended to your clients" : language === "da" ? "Udvalgt til dig" : "Selected for you"}</h2>
        <p role="status" className="text-xs text-ink-soft">{language === "da" ? `${visible.length} af ${recommendations.length} anbefalinger` : `${visible.length} of ${recommendations.length} recommendations`}</p>
      </div>
      {visible.length === 0 ? <WorkspaceEmpty
        title={language === "da" ? "Ingen anbefalinger matcher" : "No matching recommendations"}
        description={language === "da" ? "Prøv en anden søgning eller status for at finde din anbefaling." : "Try a different search or status to find your recommendation."}
        action={<button type="button" onClick={resetFilters} className="rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-surface-alt">{language === "da" ? "Vis alle anbefalinger" : "Show all recommendations"}</button>}
      /> : <ul className="ui-enter grid items-start gap-4 sm:grid-cols-2">
        {visible.map((rec) => {
          const property = propertiesById.get(rec.propertyId);
          const metadata = <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><StatusBadge status={rec.status} /><time dateTime={rec.createdAt} className="text-[11px] text-ink-faint">{new Date(rec.createdAt).toLocaleDateString(dateLocale)}</time></div>
            <p className="break-words text-xs font-medium text-ink-soft">{contactLabel(rec)}</p>
            {rec.message && <p className="line-clamp-2 break-words text-xs leading-5 text-ink-soft">{rec.message}</p>}
            {rec.responseMessage && <p className="text-[11px] font-medium text-brand-text">{language === "da" ? "Svar modtaget" : "Reply received"}</p>}
          </div>;
          return <li key={rec.id} data-testid={`recommendation-card-${rec.id}`}>
            {property ? <WorkspacePropertyCard property={property} active={selected?.id === rec.id} onPreview={() => setSelectedId(rec.id)}>{metadata}</WorkspacePropertyCard> : <div className={`space-y-4 rounded-2xl border bg-surface p-4 ${selected?.id === rec.id ? "border-brand ring-1 ring-brand/20" : "border-border"}`}>
              <div className="flex aspect-[8/5] flex-col items-center justify-center gap-3 rounded-xl bg-surface-alt px-4 text-center">
                <svg viewBox="0 0 24 24" className="h-8 w-8 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8" /></svg>
                <p className="text-sm font-medium text-ink-soft">{unavailableTitle}</p>
              </div>
              <button type="button" onClick={() => previewUnavailable(rec.id)} aria-pressed={selected?.id === rec.id} aria-controls="workspace-detail" className="w-full rounded-full border border-border px-4 py-2 text-xs font-semibold text-ink transition-colors hover:bg-surface-alt">{language === "da" ? "Se anbefaling" : "View recommendation"}</button>
              {metadata}
            </div>}
          </li>;
        })}
      </ul>}
    </>}
  </DashboardWorkspace>;
}

function RecommendationReply({ recommendation, isSent = false }: { recommendation: ListingRecommendation; isSent?: boolean }) {
  const { t, language } = useI18n();
  return recommendation.responseMessage ? <div className="rounded-2xl border border-border p-4">
    <p className="text-xs font-semibold text-ink">{t(isSent ? "recommend.clientReply" : "recommend.yourReply")}</p>
    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink-soft">{recommendation.responseMessage}</p>
    {recommendation.respondedAt && <p className="mt-3 text-[11px] text-ink-faint">{new Date(recommendation.respondedAt).toLocaleDateString(language === "da" ? "da-DK" : "en-GB")}</p>}
  </div> : <p className="text-xs leading-5 text-ink-soft">{recommendation.status === "pending"
    ? language === "da" ? "Afventer kundens svar." : "Waiting for the client’s reply."
    : language === "da" ? "Anbefalingen er besvaret uden en besked." : "The recommendation was answered without a message."}</p>;
}

function ReceivedRecommendations() {
  const { t, language } = useI18n();
  const { showToast } = useToast();
  const { recommendations, properties, respond, isResponding, isLoading, isError, isFetching, refetch } = useReceivedRecommendations(30_000);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [pendingResponse, setPendingResponse] = useState<{ id: string; status: "accepted" | "dismissed" } | null>(null);
  const [responseErrorId, setResponseErrorId] = useState<string | null>(null);

  async function handleRespond(id: string, status: "accepted" | "dismissed") {
    if (isResponding) return;
    setPendingResponse({ id, status });
    setResponseErrorId(null);
    try {
      await respond({ id, body: { status, responseMessage: replyDrafts[id]?.trim() || undefined } });
      showToast(t(status === "accepted" ? "recommend.accepted" : "recommend.dismissed"), "success");
    } catch {
      setResponseErrorId(id);
    } finally {
      setPendingResponse(null);
    }
  }

  return <RecommendationsWorkspace mode="received" recommendations={recommendations} properties={properties} isLoading={isLoading} isError={isError} isFetching={isFetching} onRetry={() => void refetch()} renderResponse={(rec) => rec.status === "pending" ? <div>
    <label htmlFor={`recommendation-reply-${rec.id}`} className="mb-2 block text-xs font-semibold text-ink">{t("recommend.yourReply")} <span className="font-normal text-ink-faint">({language === "da" ? "valgfrit" : "optional"})</span></label>
    <textarea
      id={`recommendation-reply-${rec.id}`}
      data-testid={`recommendation-reply-${rec.id}`}
      value={replyDrafts[rec.id] ?? ""}
      disabled={pendingResponse?.id === rec.id}
      onChange={(event) => setReplyDrafts((prev) => ({ ...prev, [rec.id]: event.target.value }))}
      placeholder={t("recommend.replyPlaceholder")}
      rows={4}
      className="w-full resize-y rounded-xl border border-border bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint"
    />
    {responseErrorId === rec.id && <p role="alert" className="ui-enter mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{language === "da" ? "Kunne ikke gemme dit svar. Prøv igen." : "Could not save your response. Please try again."}</p>}
    <div className="mt-3 grid grid-cols-2 gap-2">
      <button type="button" disabled={isResponding} aria-busy={pendingResponse?.id === rec.id && pendingResponse.status === "dismissed"} onClick={() => void handleRespond(rec.id, "dismissed")} className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-alt disabled:opacity-40">
        {pendingResponse?.id === rec.id && pendingResponse.status === "dismissed" && <Spinner />}{t("recommend.dismiss")}
      </button>
      <button type="button" disabled={isResponding} aria-busy={pendingResponse?.id === rec.id && pendingResponse.status === "accepted"} onClick={() => void handleRespond(rec.id, "accepted")} className="inline-flex items-center justify-center gap-2 rounded-full bg-cta px-3.5 py-2.5 text-xs font-semibold text-cta-text transition-colors hover:bg-cta-hover disabled:opacity-40">
        {pendingResponse?.id === rec.id && pendingResponse.status === "accepted" && <Spinner />}{t("recommend.accept")}
      </button>
    </div>
  </div> : <RecommendationReply recommendation={rec} />} />;
}

function SentRecommendations() {
  const { recommendations, properties, isLoading, isError, isFetching, refetch } = useSentRecommendations();
  return <RecommendationsWorkspace mode="sent" recommendations={recommendations} properties={properties} isLoading={isLoading} isError={isError} isFetching={isFetching} onRetry={() => void refetch()} />;
}

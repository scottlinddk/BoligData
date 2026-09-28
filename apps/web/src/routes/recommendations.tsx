import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listMyConnections } from "@/lib/api";
import { useReceivedRecommendations, useSentRecommendations } from "@/hooks/use-recommendations";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useToast } from "@/components/toast";
import { LoadingStatus, Skeleton, Spinner } from "@/components/ui/loading";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import type { ListingRecommendation } from "@shared/types/index";
import { formatDkk } from "@shared/utils/price";

const STATUS_LABEL: Record<ListingRecommendation["status"], TranslationKey> = {
  pending: "recommend.status.pending",
  accepted: "recommend.status.accepted",
  dismissed: "recommend.status.dismissed",
};

const STATUS_STYLE: Record<ListingRecommendation["status"], string> = {
  pending: "bg-warning-soft text-warning-text",
  accepted: "bg-success-soft text-success-text",
  dismissed: "bg-danger-soft text-danger",
};

export function RecommendationsPage() {
  const { t } = useI18n();
  const { profile, loading, error } = useUserProfile();
  const isProfessional = profile?.role === "advisor" || profile?.role === "agent";

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-3xl font-bold tracking-tight text-ink">{t("recommend.pageTitle")}</h1>
      {loading ? <RecommendationsLoading /> : error ? (
        <div className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          <p role="alert">{t("roleGuard.loadError")}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-2 font-semibold underline underline-offset-4">{t("common.retry")}</button>
        </div>
      ) : isProfessional ? <SentRecommendations /> : <ReceivedRecommendations />}
    </div>
  );
}

function RecommendationsLoading() {
  const { t } = useI18n();
  return <div>
    <LoadingStatus className="mb-3 text-ink-soft">{t("dashboard.loading")}</LoadingStatus>
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((index) => <div key={index} className="rounded-2xl border border-border bg-surface p-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="mt-3 h-3 w-1/3" />
        <Skeleton className="mt-4 h-10 w-full" />
      </div>)}
    </div>
  </div>;
}

function RecommendationsError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  const { t, language } = useI18n();
  return <div className="ui-enter mb-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
    <p role="alert">{language === "da" ? "Kunne ikke indlæse anbefalinger." : "Could not load recommendations."}</p>
    <button type="button" onClick={onRetry} disabled={retrying} className="mt-2 inline-flex items-center gap-2 font-semibold underline underline-offset-4 disabled:opacity-50">
      {retrying && <Spinner />}{retrying ? t("dashboard.loading") : t("common.retry")}
    </button>
  </div>;
}

function ReceivedRecommendations() {
  const { t, language } = useI18n();
  const { showToast } = useToast();
  const { recommendations, properties, respond, isResponding, isLoading, isError, isFetching, refetch } = useReceivedRecommendations();
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [pendingResponse, setPendingResponse] = useState<{ id: string; status: "accepted" | "dismissed" } | null>(null);
  const [responseErrorId, setResponseErrorId] = useState<string | null>(null);
  const propertiesById = new Map(properties.map((p) => [p.id, p]));
  const dateLocale = language === "da" ? "da-DK" : "en-GB";

  if (isLoading) return <RecommendationsLoading />;
  if (isError && recommendations.length === 0) return <RecommendationsError onRetry={() => void refetch()} retrying={isFetching} />;
  if (recommendations.length === 0) return <p className="font-semibold text-ink-soft">{t("recommend.receivedEmpty")}</p>;

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

  return (
    <>
      {isError && <RecommendationsError onRetry={() => void refetch()} retrying={isFetching} />}
      <ul className="ui-enter flex flex-col gap-3">
        {recommendations.map((rec) => {
          const property = propertiesById.get(rec.propertyId);
          return (
            <li key={rec.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  {property && (
                    <Link to={`/property/${property.id}`} className="font-bold text-ink hover:underline">
                      {property.address}
                    </Link>
                  )}
                  {property && <div className="text-xs font-semibold text-ink-soft">{formatDkk(property.price)}</div>}
                  <div className="mt-0.5 text-xs font-semibold text-ink-faint">
                    {new Date(rec.createdAt).toLocaleDateString(dateLocale)}
                  </div>
                </div>
                <span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase ${STATUS_STYLE[rec.status]}`}>
                  {t(STATUS_LABEL[rec.status])}
                </span>
              </div>
              {rec.message && <p className="mt-2 text-sm font-medium text-ink-soft">&ldquo;{rec.message}&rdquo;</p>}

              {rec.status === "pending" ? (
                <>
                  <textarea
                    value={replyDrafts[rec.id] ?? ""}
                    disabled={pendingResponse?.id === rec.id}
                    onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [rec.id]: e.target.value }))}
                    placeholder={t("recommend.replyPlaceholder")}
                    rows={2}
                    className="mt-2.5 w-full rounded-lg border border-border bg-paper px-3 py-2 text-sm font-medium text-ink placeholder:text-ink-faint"
                  />
                  {responseErrorId === rec.id && <p role="alert" className="ui-enter mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{language === "da" ? "Kunne ikke gemme dit svar. Prøv igen." : "Could not save your response. Please try again."}</p>}
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={isResponding}
                      aria-busy={pendingResponse?.id === rec.id && pendingResponse.status === "dismissed"}
                      onClick={() => handleRespond(rec.id, "dismissed")}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-alt disabled:opacity-40"
                    >
                      {pendingResponse?.id === rec.id && pendingResponse.status === "dismissed" && <Spinner />}
                      {t("recommend.dismiss")}
                    </button>
                    <button
                      type="button"
                      disabled={isResponding}
                      aria-busy={pendingResponse?.id === rec.id && pendingResponse.status === "accepted"}
                      onClick={() => handleRespond(rec.id, "accepted")}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-cta px-3.5 py-1.5 text-sm font-bold text-cta-text transition-colors hover:bg-cta-hover disabled:opacity-40"
                    >
                      {pendingResponse?.id === rec.id && pendingResponse.status === "accepted" && <Spinner />}
                      {t("recommend.accept")}
                    </button>
                  </div>
                </>
              ) : (
                rec.responseMessage && (
                  <p className="mt-2 rounded-lg bg-surface-alt px-3 py-2 text-sm font-medium text-ink-soft">
                    {t("recommend.yourReply")}: &ldquo;{rec.responseMessage}&rdquo;
                  </p>
                )
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function SentRecommendations() {
  const { t, language } = useI18n();
  const { recommendations, properties, isLoading, isError, isFetching, refetch } = useSentRecommendations();
  const connectionsQuery = useQuery({ queryKey: ["connections", "mine"], queryFn: listMyConnections });
  const propertiesById = new Map(properties.map((p) => [p.id, p]));
  const emailByUserId = new Map(
    (connectionsQuery.data?.connections ?? []).map((c) => [c.otherUserId, c.otherUserEmail]),
  );
  const dateLocale = language === "da" ? "da-DK" : "en-GB";

  if (isLoading) return <RecommendationsLoading />;
  if (isError && recommendations.length === 0) return <RecommendationsError onRetry={() => void refetch()} retrying={isFetching} />;
  if (recommendations.length === 0) return <p className="font-semibold text-ink-soft">{t("recommend.sentEmpty")}</p>;

  return (
    <>
      {isError && <RecommendationsError onRetry={() => void refetch()} retrying={isFetching} />}
      <ul className="ui-enter flex flex-col gap-3">
        {recommendations.map((rec) => {
          const property = propertiesById.get(rec.propertyId);
          return (
            <li key={rec.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  {property && (
                    <Link to={`/property/${property.id}`} className="font-bold text-ink hover:underline">
                      {property.address}
                    </Link>
                  )}
                  <div className="text-xs font-semibold text-ink-soft">
                    {t("recommend.sentTo", { email: emailByUserId.get(rec.userId) ?? rec.userId })}
                  </div>
                  <div className="mt-0.5 text-xs font-semibold text-ink-faint">
                    {new Date(rec.createdAt).toLocaleDateString(dateLocale)}
                  </div>
                </div>
                <span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase ${STATUS_STYLE[rec.status]}`}>
                  {t(STATUS_LABEL[rec.status])}
                </span>
              </div>
              {rec.message && <p className="mt-2 text-sm font-medium text-ink-soft">&ldquo;{rec.message}&rdquo;</p>}
              {rec.responseMessage && (
                <p className="mt-2 rounded-lg bg-surface-alt px-3 py-2 text-sm font-medium text-ink-soft">
                  {t("recommend.clientReply")}: &ldquo;{rec.responseMessage}&rdquo;
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

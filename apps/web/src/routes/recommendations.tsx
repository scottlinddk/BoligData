import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listMyConnections } from "@/lib/api";
import { useReceivedRecommendations, useSentRecommendations } from "@/hooks/use-recommendations";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useToast } from "@/components/toast";
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
  const { profile } = useUserProfile();
  const isProfessional = profile?.role === "advisor" || profile?.role === "agent";

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-3xl font-bold tracking-tight text-ink">{t("recommend.pageTitle")}</h1>
      {isProfessional ? <SentRecommendations /> : <ReceivedRecommendations />}
    </div>
  );
}

function ReceivedRecommendations() {
  const { t, language } = useI18n();
  const { showToast } = useToast();
  const { recommendations, properties, respond, isResponding } = useReceivedRecommendations();
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const propertiesById = new Map(properties.map((p) => [p.id, p]));
  const dateLocale = language === "da" ? "da-DK" : "en-GB";

  if (recommendations.length === 0) return <p className="font-semibold text-ink-soft">{t("recommend.receivedEmpty")}</p>;

  async function handleRespond(id: string, status: "accepted" | "dismissed") {
    try {
      await respond({ id, body: { status, responseMessage: replyDrafts[id]?.trim() || undefined } });
      showToast(t(status === "accepted" ? "recommend.accepted" : "recommend.dismissed"), "success");
    } catch {
      showToast(t("recommend.sendError"), "error");
    }
  }

  return (
    <ul className="flex flex-col gap-3">
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
                  onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [rec.id]: e.target.value }))}
                  placeholder={t("recommend.replyPlaceholder")}
                  rows={2}
                  className="mt-2.5 w-full rounded-lg border border-border bg-paper px-3 py-2 text-sm font-medium text-ink placeholder:text-ink-faint"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={isResponding}
                    onClick={() => handleRespond(rec.id, "dismissed")}
                    className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-bold text-ink disabled:opacity-40"
                  >
                    {t("recommend.dismiss")}
                  </button>
                  <button
                    type="button"
                    disabled={isResponding}
                    onClick={() => handleRespond(rec.id, "accepted")}
                    className="rounded-full bg-cta px-3.5 py-1.5 text-sm font-bold text-cta-text disabled:opacity-40"
                  >
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
  );
}

function SentRecommendations() {
  const { t, language } = useI18n();
  const { recommendations, properties } = useSentRecommendations();
  const connectionsQuery = useQuery({ queryKey: ["connections", "mine"], queryFn: listMyConnections });
  const propertiesById = new Map(properties.map((p) => [p.id, p]));
  const emailByUserId = new Map(
    (connectionsQuery.data?.connections ?? []).map((c) => [c.otherUserId, c.otherUserEmail]),
  );
  const dateLocale = language === "da" ? "da-DK" : "en-GB";

  if (recommendations.length === 0) return <p className="font-semibold text-ink-soft">{t("recommend.sentEmpty")}</p>;

  return (
    <ul className="flex flex-col gap-3">
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
  );
}

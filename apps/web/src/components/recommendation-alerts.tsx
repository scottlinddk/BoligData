import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useReceivedRecommendations } from "@/hooks/use-recommendations";
import { useI18n } from "@/i18n/i18n";

const POLL_INTERVAL_MS = 30_000;

/**
 * Toast/notification service for incoming listing recommendations: polls the
 * client's pending recommendations and renders one dismissible action card
 * per pending item, stacked bottom-right, so an advisor/agent's "send" shows
 * up live without the client needing to visit /recommendations.
 */
export function RecommendationAlerts() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { recommendations, properties, respond, isResponding } = useReceivedRecommendations(
    user ? POLL_INTERVAL_MS : undefined,
  );
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  if (!user) return null;

  const propertiesById = new Map(properties.map((p) => [p.id, p]));
  const visible = recommendations.filter((r) => r.status === "pending" && !hiddenIds.has(r.id));

  if (visible.length === 0) return null;

  async function handleRespond(id: string, status: "accepted" | "dismissed") {
    await respond({ id, body: { status, responseMessage: replyDrafts[id]?.trim() || undefined } });
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex w-[calc(100%-2.5rem)] max-w-sm flex-col gap-2.5">
      {visible.map((rec) => {
        const property = propertiesById.get(rec.propertyId);
        return (
          <div
            key={rec.id}
            role="status"
            className="rounded-2xl border border-border border-l-4 border-l-brand bg-surface p-3.5 shadow-lift animate-fade-up"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-brand-text">
                  {t("recommend.alertTitle")}
                </p>
                {property && (
                  <Link to={`/property/${property.id}`} className="block truncate text-sm font-bold text-ink hover:underline">
                    {property.address}
                  </Link>
                )}
              </div>
              <button
                type="button"
                aria-label={t("common.cancel")}
                onClick={() => setHiddenIds((prev) => new Set(prev).add(rec.id))}
                className="shrink-0 text-ink-faint hover:text-ink"
              >
                ✕
              </button>
            </div>
            {rec.message && <p className="mt-1.5 text-sm font-medium text-ink-soft">&ldquo;{rec.message}&rdquo;</p>}
            <textarea
              value={replyDrafts[rec.id] ?? ""}
              onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [rec.id]: e.target.value }))}
              placeholder={t("recommend.replyPlaceholder")}
              rows={2}
              className="mt-2 w-full rounded-lg border border-border bg-paper px-2.5 py-1.5 text-xs font-medium text-ink placeholder:text-ink-faint"
            />
            <div className="mt-2 flex justify-end gap-1.5">
              <button
                type="button"
                disabled={isResponding}
                onClick={() => handleRespond(rec.id, "dismissed")}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-bold text-ink disabled:opacity-40"
              >
                {t("recommend.dismiss")}
              </button>
              <button
                type="button"
                disabled={isResponding}
                onClick={() => handleRespond(rec.id, "accepted")}
                className="rounded-full bg-cta px-3 py-1.5 text-xs font-bold text-cta-text disabled:opacity-40"
              >
                {t("recommend.accept")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMyConnections } from "@/lib/api";
import { useSendRecommendations } from "@/hooks/use-recommendations";
import { useToast } from "@/components/toast";
import { useI18n } from "@/i18n/i18n";

interface RecommendModalProps {
  propertyIds: string[];
  propertyCount: number;
  onClose: () => void;
  onSent?: () => void;
}

/** Modal for an advisor/agent to send one or more listings to one or more connected clients, with a message. */
export function RecommendModal({ propertyIds, propertyCount, onClose, onSent }: RecommendModalProps) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const connectionsQuery = useQuery({ queryKey: ["connections", "mine"], queryFn: listMyConnections });
  const myClients = (connectionsQuery.data?.connections ?? []).filter((c) => c.direction === "client");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const sendMutation = useSendRecommendations();

  function toggleUser(id: string) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    if (selectedUserIds.size === 0) return;
    try {
      await sendMutation.mutateAsync({
        propertyIds,
        userIds: Array.from(selectedUserIds),
        message: message.trim() || undefined,
      });
      showToast(t("recommend.sendSuccess"), "success");
      onSent?.();
      onClose();
    } catch {
      showToast(t("recommend.sendError"), "error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-ink">
          {propertyCount === 1 ? t("recommend.titleOne") : t("recommend.title", { count: propertyCount })}
        </h2>

        <p className="mt-2 text-sm font-semibold text-ink-soft">{t("recommend.selectClients")}</p>
        {connectionsQuery.isLoading && <p className="mt-2 text-sm text-ink-soft">{t("dashboard.loading")}</p>}
        {!connectionsQuery.isLoading && myClients.length === 0 && (
          <p className="mt-2 text-sm font-semibold text-ink-soft">{t("connections.myClients.empty")}</p>
        )}
        <ul className="mt-2 flex max-h-48 flex-col gap-1.5 overflow-y-auto">
          {myClients.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-paper px-3 py-2 text-sm font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={selectedUserIds.has(c.otherUserId)}
                  onChange={() => toggleUser(c.otherUserId)}
                />
                {c.otherUserEmail || c.otherUserId}
              </label>
            </li>
          ))}
        </ul>

        <label className="mt-3 block text-sm font-semibold text-ink-soft">
          {t("recommend.messageLabel")}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("recommend.messagePlaceholder")}
            rows={3}
            className="mt-1 w-full rounded-lg border border-border bg-paper px-3 py-2 text-sm font-medium text-ink placeholder:text-ink-faint"
          />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold text-ink"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={selectedUserIds.size === 0 || sendMutation.isPending}
            onClick={handleSend}
            className="rounded-full bg-cta px-4 py-2 text-sm font-bold text-cta-text disabled:opacity-40"
          >
            {sendMutation.isPending ? t("recommend.sending") : t("recommend.send")}
          </button>
        </div>
      </div>
    </div>
  );
}

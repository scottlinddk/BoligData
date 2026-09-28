import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMyConnections } from "@/lib/api";
import { useSendRecommendations } from "@/hooks/use-recommendations";
import { useToast } from "@/components/toast";
import { useI18n } from "@/i18n/i18n";
import { LoadingStatus, Skeleton, Spinner } from "@/components/ui/loading";

interface RecommendModalProps {
  propertyIds: string[];
  propertyCount: number;
  onClose: () => void;
  onSent?: () => void;
}

/** Modal for an advisor/agent to send one or more listings to one or more connected clients, with a message. */
export function RecommendModal({ propertyIds, propertyCount, onClose, onSent }: RecommendModalProps) {
  const { t, language } = useI18n();
  const { showToast } = useToast();
  const connectionsQuery = useQuery({ queryKey: ["connections", "mine"], queryFn: listMyConnections });
  const myClients = (connectionsQuery.data?.connections ?? []).filter((c) => c.direction === "client");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const sendMutation = useSendRecommendations();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  function toggleUser(id: string) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    if (selectedUserIds.size === 0 || sendMutation.isPending) return;
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
      // A request can finish after dismissal; keep its failure visible in that case.
      if (!dialogRef.current?.open) showToast(t("recommend.sendError"), "error");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')].filter(control => control.getClientRects().length > 0);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
      }}
      className="ui-enter fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-5 text-ink shadow-lift backdrop:bg-black/50"
    >
      <h2 id={titleId} className="text-lg font-bold text-ink">
        {propertyCount === 1 ? t("recommend.titleOne") : t("recommend.title", { count: propertyCount })}
      </h2>

      <p className="mt-2 text-sm font-semibold text-ink-soft">{t("recommend.selectClients")}</p>
      {connectionsQuery.isPending && (
        <div className="mt-2">
          <LoadingStatus className="text-sm text-ink-soft">{t("dashboard.loading")}</LoadingStatus>
          <div className="mt-2 space-y-1.5" aria-hidden="true">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
          </div>
        </div>
      )}
      {connectionsQuery.isError && (
        <div className="ui-enter mt-2 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          <p role="alert">{language === "da" ? "Kunne ikke indlæse dine kunder." : "Could not load your clients."}</p>
          <button type="button" onClick={() => void connectionsQuery.refetch()} disabled={connectionsQuery.isFetching} className="mt-2 inline-flex items-center gap-2 font-semibold underline underline-offset-4 disabled:opacity-50">
            {connectionsQuery.isFetching && <Spinner />}
            {connectionsQuery.isFetching ? t("dashboard.loading") : t("common.retry")}
          </button>
        </div>
      )}
      {connectionsQuery.isSuccess && myClients.length === 0 && (
        <p className="mt-2 text-sm font-semibold text-ink-soft">{t("connections.myClients.empty")}</p>
      )}
      <ul className="mt-2 flex max-h-48 flex-col gap-1.5 overflow-y-auto">
        {myClients.map((c) => (
          <li key={c.id}>
            <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold text-ink transition-colors ${selectedUserIds.has(c.otherUserId) ? "border-brand bg-brand-soft" : "border-border bg-paper hover:bg-surface-alt"}`}>
              <input
                type="checkbox"
                checked={selectedUserIds.has(c.otherUserId)}
                disabled={sendMutation.isPending}
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
          disabled={sendMutation.isPending}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("recommend.messagePlaceholder")}
          rows={3}
          className="mt-1 w-full rounded-lg border border-border bg-paper px-3 py-2 text-sm font-medium text-ink placeholder:text-ink-faint"
        />
      </label>

      {sendMutation.isError && <p role="alert" className="ui-enter mt-3 rounded-lg bg-danger-soft p-3 text-sm text-danger">{t("recommend.sendError")}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold text-ink transition-colors hover:bg-surface-alt"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          disabled={selectedUserIds.size === 0 || sendMutation.isPending}
          aria-busy={sendMutation.isPending}
          onClick={handleSend}
          className="inline-flex min-w-24 items-center justify-center gap-2 rounded-full bg-cta px-4 py-2 text-sm font-bold text-cta-text transition-colors hover:bg-cta-hover disabled:opacity-40"
        >
          {sendMutation.isPending && <Spinner />}
          {sendMutation.isPending ? t("recommend.sending") : t("recommend.send")}
        </button>
      </div>
    </dialog>
  );
}

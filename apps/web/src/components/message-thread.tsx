import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/i18n";
import type { ConversationWithContext, Message } from "@shared/types/index";

interface MessageThreadProps {
  conversation: ConversationWithContext;
  messages: Message[];
  currentUserId: string;
  onSend: (body: string) => Promise<unknown>;
  isSending: boolean;
  onBack?: () => void;
}

export function MessageThread({ conversation, messages, currentUserId, onSend, isSending, onBack }: MessageThreadProps) {
  const { t, language } = useI18n();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const dateLocale = language === "da" ? "da-DK" : "en-GB";

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  async function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await onSend(text);
  }

  return (
    <div className="flex h-[460px] flex-col rounded-2xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        {onBack && (
          <button type="button" onClick={onBack} className="text-sm font-bold text-ink-soft" aria-label={t("common.back")}>
            ←
          </button>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink">{conversation.counterpartName}</p>
          {conversation.propertyAddress && (
            <p className="truncate text-[11px] text-ink-faint">{conversation.propertyAddress}</p>
          )}
        </div>
      </div>

      <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {messages.map((m) => {
          const isMine = m.senderId === currentUserId;
          return (
            <div key={m.id} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                  isMine ? "bg-cta text-cta-text" : "bg-surface-alt text-ink"
                }`}
              >
                {m.body}
              </div>
              <span className="mt-0.5 text-[10.5px] text-ink-faint">
                {new Date(m.createdAt).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder={t("messages.inputPlaceholder")}
          className="min-w-0 flex-1 rounded-full border border-border bg-paper px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint"
        />
        <button
          type="button"
          disabled={isSending || !draft.trim()}
          onClick={handleSend}
          className="shrink-0 rounded-full bg-cta px-4 py-2.5 text-sm font-bold text-cta-text disabled:opacity-40"
        >
          {t("messages.send")}
        </button>
      </div>
    </div>
  );
}

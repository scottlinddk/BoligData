import { useI18n } from "@/i18n/i18n";
import type { ConversationWithContext } from "@shared/types/index";

interface ConversationListProps {
  conversations: ConversationWithContext[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationList({ conversations, activeId, onSelect }: ConversationListProps) {
  const { t } = useI18n();

  if (conversations.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-strong p-8 text-center text-sm font-semibold text-ink-soft">
        {t("messages.empty")}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-1 overflow-y-auto">
      {conversations.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onSelect(c.id)}
            className={`w-full rounded-xl px-3 py-2.5 text-left ${c.id === activeId ? "bg-surface-alt" : ""}`}
          >
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-bold text-ink">{c.counterpartName}</span>
              {c.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
            </div>
            {c.propertyAddress && (
              <p className="truncate text-[11px] text-ink-faint">{c.propertyAddress}</p>
            )}
            {c.lastMessage && (
              <p className="truncate text-xs text-ink-soft">{c.lastMessage.body}</p>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

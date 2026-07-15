import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AccountSubNav } from "@/components/account-subnav";
import { ConversationList } from "@/components/conversation-list";
import { MessageThread } from "@/components/message-thread";
import { useConversations, useMessageThread } from "@/hooks/use-conversations";
import { useAuth } from "@/hooks/use-auth";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useI18n } from "@/i18n/i18n";

export function AccountMessagesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [searchParams, setSearchParams] = useSearchParams();
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");

  const { conversations } = useConversations();
  const activeId = searchParams.get("conversationId");
  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;
  const { messages, send, isSending } = useMessageThread(activeId);

  function selectConversation(id: string) {
    setSearchParams({ conversationId: id });
    setMobileView("thread");
  }

  const showList = !isMobile || mobileView === "list";
  const showThread = !isMobile || mobileView === "thread";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <AccountSubNav />
      <h1 className="mb-4 text-3xl font-bold tracking-tight text-ink">{t("messages.title")}</h1>

      <div className="flex gap-4">
        {showList && (
          <div className={isMobile ? "w-full" : "w-[260px] shrink-0"}>
            <ConversationList conversations={conversations} activeId={activeId} onSelect={selectConversation} />
          </div>
        )}
        {showThread && (
          <div className="min-w-0 flex-1">
            {activeConversation && user ? (
              <MessageThread
                conversation={activeConversation}
                messages={messages}
                currentUserId={user.id}
                onSend={(body) => send(body)}
                isSending={isSending}
                onBack={isMobile ? () => setMobileView("list") : undefined}
              />
            ) : (
              !isMobile && (
                <div className="flex h-[460px] items-center justify-center rounded-2xl border border-dashed border-border-strong text-sm font-semibold text-ink-soft">
                  {t("messages.selectConversation")}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

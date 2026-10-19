import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listConversations, listMessages, sendMessage, startConversation } from "@/lib/api";
import type { CreateConversationBody } from "@shared/types/api";

const CONVERSATIONS_POLL_MS = 15_000;

/** Inbox list — polled so unread state stays roughly live without websockets. */
export function useConversations(enabled = true) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
    enabled,
    refetchInterval: enabled ? CONVERSATIONS_POLL_MS : undefined,
  });

  const startMutation = useMutation({
    mutationFn: (body: CreateConversationBody) => startConversation(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });

  return {
    conversations: query.data?.conversations ?? [],
    isLoading: query.isLoading,
    startConversation: startMutation.mutateAsync,
  };
}

/** A single thread's messages — polled while open, and marks the thread read as a side effect of loading. */
export function useMessageThread(conversationId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => listMessages(conversationId as string),
    enabled: conversationId !== null,
    refetchInterval: conversationId !== null ? CONVERSATIONS_POLL_MS : undefined,
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) => sendMessage(conversationId as string, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  return {
    messages: query.data?.messages ?? [],
    isLoading: query.isLoading,
    send: sendMutation.mutateAsync,
    isSending: sendMutation.isPending,
  };
}

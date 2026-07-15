import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listNotifications, markNotificationRead } from "@/lib/api";
import type { NotificationType } from "@shared/types/index";

/** Shared notification feed — the header badge and the Notifications view both read from this. */
export function useNotifications(options: { unreadOnly?: boolean; type?: NotificationType } = {}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["notifications", options.unreadOnly ?? false, options.type ?? "all"],
    queryFn: () => listNotifications(options.unreadOnly ?? false, options.type),
  });

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const notifications = query.data?.notifications ?? [];

  async function markAllRead() {
    await Promise.all(notifications.filter((n) => !n.readAt).map((n) => markReadMutation.mutateAsync(n.id)));
  }

  return {
    notifications,
    isLoading: query.isLoading,
    markRead: markReadMutation.mutateAsync,
    isMarkingRead: markReadMutation.isPending,
    markAllRead,
  };
}

/** Just the unread count — for the header avatar badge, polled lightly. */
export function useUnreadNotificationCount(enabled: boolean) {
  const query = useQuery({
    queryKey: ["notifications", true, "all"],
    queryFn: () => listNotifications(true),
    enabled,
    refetchInterval: enabled ? 30_000 : undefined,
  });
  return query.data?.notifications.length ?? 0;
}

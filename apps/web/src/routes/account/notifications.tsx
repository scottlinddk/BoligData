import { useState } from "react";
import { AccountSubNav } from "@/components/account-subnav";
import { NotificationList } from "@/components/notification-list";
import { useNotifications } from "@/hooks/use-notifications";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import type { NotificationType } from "@shared/types/index";

const FILTERS: { value: NotificationType | "all"; labelKey: TranslationKey }[] = [
  { value: "all", labelKey: "notifications.filter.all" },
  { value: "new_listing", labelKey: "notifications.type.newListing" },
  { value: "price_drop", labelKey: "notifications.type.priceDrop" },
  { value: "message", labelKey: "notifications.type.message" },
  { value: "data_update", labelKey: "notifications.type.dataUpdate" },
  { value: "system", labelKey: "notifications.type.system" },
];

export function AccountNotificationsPage() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<NotificationType | "all">("all");
  const { notifications, markRead, markAllRead } = useNotifications(
    filter === "all" ? {} : { type: filter },
  );
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <AccountSubNav />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t("notifications.title")}</h1>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllRead()}
            className="font-mono text-xs font-semibold uppercase tracking-widest text-brand-text"
          >
            {t("notifications.markAllRead")}
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest ${
              filter === f.value ? "bg-cta text-cta-text" : "border border-border bg-surface text-ink-soft"
            }`}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      <NotificationList notifications={notifications} onMarkRead={(id) => markRead(id)} />
    </div>
  );
}

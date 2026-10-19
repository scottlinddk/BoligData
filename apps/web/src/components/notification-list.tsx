import { Link } from "react-router-dom";
import { useI18n } from "@/i18n/i18n";
import type { Notification, NotificationType } from "@shared/types/index";
import type { TranslationKey } from "@/i18n/translations";

const TYPE_LABEL_KEY: Record<NotificationType, TranslationKey> = {
  new_listing: "notifications.type.newListing",
  price_drop: "notifications.type.priceDrop",
  message: "notifications.type.message",
  data_update: "notifications.type.dataUpdate",
  system: "notifications.type.system",
};

interface NotificationListProps {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
}

export function NotificationList({ notifications, onMarkRead }: NotificationListProps) {
  const { t, language } = useI18n();
  const dateLocale = language === "da" ? "da-DK" : "en-GB";

  if (notifications.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-strong p-8 text-center text-sm font-semibold text-ink-soft">
        {t("notifications.empty")}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {notifications.map((n) => {
        const unread = !n.readAt;
        const content = (
          <div
            className={`rounded-[14px] border border-border p-3.5 ${unread ? "bg-surface-alt" : "bg-surface"}`}
          >
            <div className="flex items-center gap-1.5">
              {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-faint">
                {t(TYPE_LABEL_KEY[n.type])}
              </span>
              <span className="font-mono text-[10px] text-ink-faint">
                · {new Date(n.createdAt).toLocaleDateString(dateLocale)}
              </span>
            </div>
            {n.title && <p className="mt-1 text-sm font-bold text-ink">{n.title}</p>}
            {n.body && <p className="mt-0.5 text-sm text-ink-soft">{n.body}</p>}
          </div>
        );
        return (
          <li key={n.id}>
            {n.linkPath ? (
              <Link to={n.linkPath} onClick={() => unread && onMarkRead(n.id)} className="block">
                {content}
              </Link>
            ) : (
              <button type="button" onClick={() => unread && onMarkRead(n.id)} className="block w-full text-left">
                {content}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

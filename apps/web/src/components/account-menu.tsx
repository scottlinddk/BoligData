import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useUnreadNotificationCount } from "@/hooks/use-notifications";
import { useConversations } from "@/hooks/use-conversations";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";

interface AccountMenuItem {
  to: string;
  labelKey: TranslationKey;
  badge?: number;
}

/** Shared by the desktop dropdown and the mobile slide-down panel in Header. */
export function useAccountMenuItems(): AccountMenuItem[] {
  const { user } = useAuth();
  const unreadNotifications = useUnreadNotificationCount(!!user);
  const { conversations } = useConversations(!!user);
  const unreadMessages = conversations.filter((c) => c.unread).length;

  return [
    { to: "/account/notifications", labelKey: "nav.notifications", badge: unreadNotifications || undefined },
    { to: "/account/messages", labelKey: "nav.messages", badge: unreadMessages || undefined },
    { to: "/account/profile", labelKey: "nav.profile" },
    { to: "/account/settings", labelKey: "nav.settings" },
  ];
}

/** Desktop-only: circular avatar-initial button that opens a dropdown of account links + sign out. */
export function AccountMenu() {
  const { user, signOut } = useAuth();
  const { profile } = useUserProfile();
  const { t } = useI18n();
  const items = useAccountMenuItems();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const initial = (profile?.fullName || user.email || "?").trim().charAt(0).toUpperCase();
  const totalUnread = items.reduce((sum, item) => sum + (item.badge ?? 0), 0);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("nav.account")}
        aria-expanded={open}
        className="relative flex h-[34px] w-[34px] items-center justify-center rounded-full border border-border bg-surface text-[13px] font-bold text-ink-soft"
      >
        {initial}
        {totalUnread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[15px] w-[15px] items-center justify-center rounded-full bg-brand text-[9px] font-bold text-white">
            {totalUnread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="fixed inset-0 z-50 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-[42px] z-[60] flex w-[212px] flex-col gap-0.5 rounded-2xl border border-border bg-surface p-2 shadow-lift animate-pop-in">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm font-semibold text-ink hover:bg-surface-alt"
              >
                <span>{t(item.labelKey)}</span>
                {item.badge !== undefined && (
                  <span className="rounded-full bg-brand px-1.5 py-0.5 text-[9.5px] font-bold text-white">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
            <div className="mt-1 border-t border-border pt-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  signOut();
                }}
                className="w-full rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-ink-soft hover:bg-surface-alt"
              >
                {t("nav.signOut")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

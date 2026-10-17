import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useAccountMenuItems } from "@/components/account-menu";
import { useI18n } from "@/i18n/i18n";

interface Tab {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  end?: boolean;
}

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
);

/** Routes that bring their own fixed bottom bar, or are shown before sign-in. */
const HIDDEN_PREFIXES = ["/property/", "/auth/"];

/** Phone and tablet navigation. The desktop header nav takes over from 1280px. */
export function MobileTabBar() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { t, language } = useI18n();
  const items = useAccountMenuItems();
  if (!user || HIDDEN_PREFIXES.some(prefix => pathname.startsWith(prefix))) return null;

  const tabs: Tab[] = [
    { to: "/", end: true, label: t("nav.search"), icon: icon(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>) },
    { to: "/research", label: language === "da" ? "Projekt" : "Project", icon: icon(<><path d="M4 21V7l8-4 8 4v14" /><path d="M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01" /></>) },
    { to: "/dashboard", label: t("nav.dashboard"), icon: icon(<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />) },
    { to: "/account/messages", label: t("nav.messages"), badge: items.find(item => item.to === "/account/messages")?.badge, icon: icon(<><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" /></>) },
    { to: "/account/profile", label: t("nav.account"), icon: icon(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>) },
  ];

  return <nav aria-label={language === "da" ? "Hurtig navigation" : "Quick navigation"}
    className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.04)] xl:hidden print:hidden">
    <ul className="mx-auto flex max-w-xl items-stretch justify-between px-2">
      {tabs.map(tab => <li key={tab.to} className="min-w-0 flex-1">
        <NavLink to={tab.to} end={tab.end}
          className={({ isActive }) => `relative flex min-h-[3.75rem] flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors ${isActive ? "text-brand-text" : "text-ink-soft hover:text-ink"}`}>
          <span className="relative">
            {tab.icon}
            {tab.badge ? <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-cta px-1 text-[10px] font-semibold leading-none text-cta-text">{tab.badge}</span> : null}
          </span>
          <span className="max-w-full truncate">{tab.label}</span>
        </NavLink>
      </li>)}
    </ul>
  </nav>;
}

import { NavLink } from "react-router-dom";
import { useI18n } from "@/i18n/i18n";

const TABS = [
  { to: "/account/notifications", labelKey: "nav.notifications" as const },
  { to: "/account/messages", labelKey: "nav.messages" as const },
  { to: "/account/profile", labelKey: "nav.profile" as const },
  { to: "/account/settings", labelKey: "nav.settings" as const },
];

/** The 4-tab pill row shown on every /account/* view, same segmented style as search's List/Map control. */
export function AccountSubNav() {
  const { t } = useI18n();
  return (
    <nav className="mx-auto mb-5 flex max-w-3xl gap-2 px-4 sm:px-0">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `flex-1 rounded-full px-3 py-2 text-center font-mono text-[11px] uppercase tracking-widest ${
              isActive ? "bg-cta text-cta-text" : "border border-border bg-surface text-ink-soft"
            }`
          }
        >
          {t(tab.labelKey)}
        </NavLink>
      ))}
    </nav>
  );
}

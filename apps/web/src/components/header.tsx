import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useI18n } from "@/i18n/i18n";
import { useMediaQuery } from "@/hooks/use-media-query";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountMenu, useAccountMenuItems } from "@/components/account-menu";
import { BrandMark } from "@/components/brand-mark";

export function Header() {
  const { user, signOut } = useAuth();
  const { profile } = useUserProfile();
  const { t, language } = useI18n();
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const [menuOpen, setMenuOpen] = useState(false);
  const accountMenuItems = useAccountMenuItems();
  const links = [
    { to: "/", label: t("nav.search") },
    ...(user ? [
      { to: "/research", label: language === "da" ? "Boligprojekt" : "Buying project" },
      { to: "/dashboard", label: t("nav.dashboard") },
      { to: "/recommendations", label: t("nav.recommendations") },
      ...(profile?.role === "admin" ? [{ to: "/admin", label: t("nav.admin") }] : []),
      ...(profile?.role === "advisor" ? [{ to: "/advisor", label: t("nav.advisor") }] : []),
      ...(profile?.role === "agent" ? [{ to: "/agent", label: t("nav.agent") }] : []),
    ] : []),
  ];
  const navClass = ({ isActive }: { isActive: boolean }) => `rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors ${isActive ? "bg-surface-alt text-ink" : "text-ink-soft hover:bg-surface-alt hover:text-ink"}`;

  return <header className="sticky top-0 z-40 border-b border-border bg-surface" onKeyDown={event => { if (event.key === "Escape") setMenuOpen(false); }}>
    <div className="mx-auto flex h-16 max-w-[1680px] items-center justify-between gap-5 px-5 sm:px-8 xl:px-12">
      <div className="flex min-w-0 items-center gap-8">
        <Link to="/" onClick={() => setMenuOpen(false)} className="flex shrink-0 items-center gap-2 text-[19px] font-bold tracking-[-0.045em] text-ink">
          <BrandMark className="h-7 w-7 text-brand" />{t("app.name")}
        </Link>
        {!isMobile && <nav aria-label={language === "da" ? "Hovednavigation" : "Main navigation"} className="flex items-center gap-1 border-l border-border pl-6">
          {links.map(link => <NavLink key={link.to} to={link.to} end={link.to === "/"} className={navClass}>{link.label}</NavLink>)}
        </nav>}
      </div>
      {!isMobile ? <div className="flex shrink-0 items-center gap-3">
        <LanguageSwitcher /><ThemeToggle />
        <div className="ml-1 border-l border-border pl-4">
          {user ? <AccountMenu /> : <Link to="/auth/signin" className="flex items-center gap-2 rounded-full bg-cta px-5 py-2 text-[13px] font-semibold text-cta-text transition-colors hover:bg-cta-hover">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10" cy="6" r="3" /><path d="M4 17v-1a6 6 0 0 1 12 0v1" /></svg>{t("nav.signIn")}
          </Link>}
        </div>
      </div> : <div className="flex items-center gap-2">
        <ThemeToggle />
        <button type="button" onClick={() => setMenuOpen(value => !value)} aria-label={t("nav.menu")} aria-expanded={menuOpen} aria-controls="mobile-main-menu" className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-ink">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">{menuOpen ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}</svg>
        </button>
      </div>}
    </div>
    {isMobile && menuOpen && <nav id="mobile-main-menu" aria-label={language === "da" ? "Hovednavigation" : "Main navigation"} className="max-h-[calc(100dvh-64px)] overflow-y-auto border-t border-border bg-surface px-5 py-4 animate-fade-up">
      <div className="grid gap-1">{links.map(link => <NavLink key={link.to} to={link.to} end={link.to === "/"} onClick={() => setMenuOpen(false)} className={navClass}>{link.label}</NavLink>)}</div>
      {user ? <div className="my-3 grid gap-1 border-y border-border py-3">
        {accountMenuItems.map(item => <Link key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className="flex items-center justify-between rounded-lg px-3.5 py-2 text-sm text-ink-soft hover:bg-surface-alt">
          <span>{t(item.labelKey)}</span>{item.badge !== undefined && <span className="rounded-full bg-cta px-2 py-0.5 text-[10px] font-semibold text-cta-text">{item.badge}</span>}
        </Link>)}
        <button type="button" onClick={() => { setMenuOpen(false); void signOut(); }} className="rounded-lg px-3.5 py-2 text-left text-sm font-medium text-ink-soft hover:bg-surface-alt">{t("nav.signOut")}</button>
      </div> : <Link to="/auth/signin" onClick={() => setMenuOpen(false)} className="my-3 block rounded-full bg-cta px-4 py-2.5 text-center text-sm font-semibold text-cta-text hover:bg-cta-hover">{t("nav.signIn")}</Link>}
      <LanguageSwitcher />
    </nav>}
  </header>;
}

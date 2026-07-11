import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useI18n } from "@/i18n/i18n";
import { useMediaQuery } from "@/hooks/use-media-query";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  const { user, signOut } = useAuth();
  const { profile } = useUserProfile();
  const { t } = useI18n();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-ink">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand text-sm text-white">
            B
          </span>
          {t("app.name")}
        </Link>

        {!isMobile && (
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/" className="font-semibold text-ink-soft hover:text-ink">
              {t("nav.search")}
            </Link>
            {user ? (
              <>
                <Link to="/dashboard" className="font-semibold text-ink-soft hover:text-ink">
                  {t("nav.dashboard")}
                </Link>
                {profile?.role === "admin" && (
                  <Link to="/admin" className="font-semibold text-ink-soft hover:text-ink">
                    {t("nav.admin")}
                  </Link>
                )}
                {profile?.role === "advisor" && (
                  <Link to="/advisor" className="font-semibold text-ink-soft hover:text-ink">
                    {t("nav.advisor")}
                  </Link>
                )}
                {profile?.role === "agent" && (
                  <Link to="/agent" className="font-semibold text-ink-soft hover:text-ink">
                    {t("nav.agent")}
                  </Link>
                )}
                <button
                  onClick={() => signOut()}
                  className="rounded-full bg-surface-alt px-4 py-2 text-sm font-semibold text-ink-soft transition hover:bg-surface-hover"
                >
                  {t("nav.signOut")}
                </button>
              </>
            ) : (
              <Link
                to="/auth/signin"
                className="rounded-full bg-brand-soft px-4 py-2 text-sm font-semibold text-brand-text transition hover:-translate-y-px"
              >
                {t("nav.signIn")}
              </Link>
            )}
            <LanguageSwitcher />
            <ThemeToggle />
          </nav>
        )}

        {isMobile && (
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={t("nav.menu")}
              aria-expanded={menuOpen}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-base text-ink-soft"
            >
              ☰
            </button>
          </div>
        )}
      </div>

      {isMobile && menuOpen && (
        <div className="flex flex-col gap-2.5 border-t border-border px-5 pb-4 pt-3 animate-fade-up">
          <Link to="/" onClick={() => setMenuOpen(false)} className="font-semibold text-ink-soft">
            {t("nav.search")}
          </Link>
          {user ? (
            <>
              <Link to="/dashboard" onClick={() => setMenuOpen(false)} className="font-semibold text-ink-soft">
                {t("nav.dashboard")}
              </Link>
              {profile?.role === "admin" && (
                <Link to="/admin" onClick={() => setMenuOpen(false)} className="font-semibold text-ink-soft">
                  {t("nav.admin")}
                </Link>
              )}
              {profile?.role === "advisor" && (
                <Link to="/advisor" onClick={() => setMenuOpen(false)} className="font-semibold text-ink-soft">
                  {t("nav.advisor")}
                </Link>
              )}
              {profile?.role === "agent" && (
                <Link to="/agent" onClick={() => setMenuOpen(false)} className="font-semibold text-ink-soft">
                  {t("nav.agent")}
                </Link>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  signOut();
                }}
                className="rounded-lg bg-surface-alt px-3.5 py-2.5 text-left text-sm font-bold text-ink-soft"
              >
                {t("nav.signOut")}
              </button>
            </>
          ) : (
            <Link
              to="/auth/signin"
              onClick={() => setMenuOpen(false)}
              className="rounded-lg bg-brand-soft px-3.5 py-2.5 text-left text-sm font-bold text-brand-text"
            >
              {t("nav.signIn")}
            </Link>
          )}
          <LanguageSwitcher />
        </div>
      )}

      <svg width="100%" height="6" viewBox="0 0 1180 6" preserveAspectRatio="none" className="block text-brand opacity-55">
        <line x1="0" y1="3" x2="1180" y2="3" stroke="currentColor" strokeWidth="1" strokeDasharray="2 8" strokeLinecap="round" />
      </svg>
    </header>
  );
}

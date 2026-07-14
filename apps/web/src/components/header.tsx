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
    <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="text-[19px] font-bold tracking-[-0.02em] text-ink">
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
                className="rounded-full bg-cta px-4 py-2 text-sm font-semibold text-cta-text transition hover:-translate-y-px hover:bg-cta-hover"
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
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-base text-ink-soft"
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
                className="rounded-full bg-surface-alt px-3.5 py-2.5 text-left text-sm font-bold text-ink-soft"
              >
                {t("nav.signOut")}
              </button>
            </>
          ) : (
            <Link
              to="/auth/signin"
              onClick={() => setMenuOpen(false)}
              className="rounded-full bg-cta px-3.5 py-2.5 text-left text-sm font-bold text-cta-text"
            >
              {t("nav.signIn")}
            </Link>
          )}
          <LanguageSwitcher />
        </div>
      )}

    </header>
  );
}

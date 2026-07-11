import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  const { user, signOut } = useAuth();
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-ink">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand text-sm text-white">
            B
          </span>
          {t("app.name")}
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/" className="font-semibold text-ink-soft hover:text-ink">
            {t("nav.search")}
          </Link>
          {user ? (
            <>
              <Link to="/dashboard" className="font-semibold text-ink-soft hover:text-ink">
                {t("nav.dashboard")}
              </Link>
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
      </div>
      <svg width="100%" height="6" viewBox="0 0 1180 6" preserveAspectRatio="none" className="block text-brand opacity-55">
        <line x1="0" y1="3" x2="1180" y2="3" stroke="currentColor" strokeWidth="1" strokeDasharray="2 8" strokeLinecap="round" />
      </svg>
    </header>
  );
}

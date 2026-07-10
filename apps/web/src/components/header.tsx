import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  const { user, signOut } = useAuth();
  const { t } = useI18n();

  return (
    <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {t("app.name")}
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/" className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
            {t("nav.search")}
          </Link>
          {user ? (
            <>
              <Link
                to="/dashboard"
                className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              >
                {t("nav.dashboard")}
              </Link>
              <button
                onClick={() => signOut()}
                className="rounded-md bg-slate-100 px-3 py-1.5 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {t("nav.signOut")}
              </button>
            </>
          ) : (
            <Link
              to="/auth/signin"
              className="rounded-md bg-brand-600 px-3 py-1.5 text-white hover:bg-brand-700"
            >
              {t("nav.signIn")}
            </Link>
          )}
          <LanguageSwitcher />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

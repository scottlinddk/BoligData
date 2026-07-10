import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n/i18n";

export function UpdatePasswordPage() {
  const { t } = useI18n();
  const { user, loading, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await updatePassword(password);
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSubmitted(true);
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500 dark:text-slate-400">{t("detail.loading")}</div>;
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {t("auth.updatePassword.title")}
        </h1>
        <p className="mb-4 text-slate-600 dark:text-slate-300">{t("auth.updatePassword.success")}</p>
        <Link to="/auth/signin" className="text-brand-600 hover:underline dark:text-brand-400">
          {t("auth.updatePassword.backToSignIn")}
        </Link>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {t("auth.updatePassword.title")}
        </h1>
        <p className="mb-4 text-slate-600 dark:text-slate-300">{t("auth.updatePassword.invalidLink")}</p>
        <Link to="/auth/reset-password" className="text-brand-600 hover:underline dark:text-brand-400">
          {t("auth.updatePassword.requestNewLink")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900 dark:text-slate-100">
        {t("auth.updatePassword.title")}
      </h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="password"
          required
          minLength={8}
          placeholder={t("auth.updatePassword.passwordPlaceholder")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand-600 px-3 py-2 text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? t("auth.updatePassword.submitting") : t("auth.updatePassword.submit")}
        </button>
      </form>
    </div>
  );
}

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
    return <div className="p-8 text-center font-semibold text-ink-soft">{t("detail.loading")}</div>;
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16 text-center">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-ink">{t("auth.updatePassword.title")}</h1>
        <p className="mb-4 font-medium text-ink-soft">{t("auth.updatePassword.success")}</p>
        <Link to="/auth/signin" className="font-semibold text-brand-text hover:underline">
          {t("auth.updatePassword.backToSignIn")}
        </Link>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16 text-center">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-ink">{t("auth.updatePassword.title")}</h1>
        <p className="mb-4 font-medium text-ink-soft">{t("auth.updatePassword.invalidLink")}</p>
        <Link to="/auth/reset-password" className="font-semibold text-brand-text hover:underline">
          {t("auth.updatePassword.requestNewLink")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-3xl font-bold tracking-tight text-ink">{t("auth.updatePassword.title")}</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="password"
          required
          minLength={8}
          placeholder={t("auth.updatePassword.passwordPlaceholder")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-ink"
        />
        {error && <p className="text-sm font-semibold text-danger">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-brand px-3 py-2 font-bold text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {submitting ? t("auth.updatePassword.submitting") : t("auth.updatePassword.submit")}
        </button>
      </form>
    </div>
  );
}

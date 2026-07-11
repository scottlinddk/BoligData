import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n/i18n";

export function SignUpPage() {
  const { t } = useI18n();
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signUp(email, password);
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16 text-center">
        <h1 className="mb-2 font-serif text-3xl italic text-ink">{t("auth.signUp.checkEmail")}</h1>
        <p className="font-medium text-ink-soft">{t("auth.signUp.confirmationSent", { email })}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 font-serif text-3xl italic text-ink">{t("auth.signUp.title")}</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder={t("auth.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-ink"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder={t("auth.signUp.passwordPlaceholder")}
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
          {submitting ? t("auth.signUp.submitting") : t("auth.signUp.submit")}
        </button>
      </form>
      <div className="mt-4 text-sm font-semibold text-ink-soft">
        {t("auth.signUp.haveAccount")} <Link to="/auth/signin">{t("auth.signIn.title")}</Link>
      </div>
    </div>
  );
}

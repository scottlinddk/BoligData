import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n/i18n";

export function SignInPage() {
  const { t } = useI18n();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate("/dashboard");
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("auth.signIn.title")}</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder={t("auth.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <input
          type="password"
          required
          placeholder={t("auth.password")}
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
          {submitting ? t("auth.signIn.submitting") : t("auth.signIn.submit")}
        </button>
      </form>
      <div className="mt-4 flex justify-between text-sm text-slate-500 dark:text-slate-400">
        <Link to="/auth/signup">{t("auth.signIn.createAccount")}</Link>
        <Link to="/auth/reset-password">{t("auth.signIn.forgotPassword")}</Link>
      </div>
    </div>
  );
}

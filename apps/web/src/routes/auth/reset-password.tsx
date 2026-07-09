import { FormEvent, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n/i18n";

export function ResetPasswordPage() {
  const { t } = useI18n();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await resetPassword(email);
    setSubmitting(false);
    setSent(true);
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("auth.reset.title")}</h1>
      {sent ? (
        <p className="text-slate-600 dark:text-slate-300">{t("auth.reset.sent", { email })}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder={t("auth.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand-600 px-3 py-2 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? t("auth.reset.submitting") : t("auth.reset.submit")}
          </button>
        </form>
      )}
    </div>
  );
}

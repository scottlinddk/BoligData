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
      <h1 className="mb-6 text-3xl font-bold tracking-tight text-ink">{t("auth.reset.title")}</h1>
      {sent ? (
        <p className="font-medium text-ink-soft">{t("auth.reset.sent", { email })}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder={t("auth.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-ink"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-cta px-3 py-2 font-bold text-cta-text transition hover:bg-cta-hover disabled:opacity-50"
          >
            {submitting ? t("auth.reset.submitting") : t("auth.reset.submit")}
          </button>
        </form>
      )}
    </div>
  );
}

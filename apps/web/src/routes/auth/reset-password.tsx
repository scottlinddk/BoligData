import { FormEvent, useState } from "react";
import { Button, Field, Input, Notice } from "@scttlnd/ui";
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
        <Notice tone="success">{t("auth.reset.sent", { email })}</Notice>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Field label={t("auth.email")}>
            {(control) => (
              <Input
                {...control}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" disabled={submitting}>
            {submitting ? t("auth.reset.submitting") : t("auth.reset.submit")}
          </Button>
        </form>
      )}
    </div>
  );
}

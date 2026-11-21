import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Field, Input, Notice } from "@scttlnd/ui";
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
      <h1 className="mb-6 text-3xl font-bold tracking-tight text-ink">{t("auth.signIn.title")}</h1>
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
        <Field label={t("auth.password")}>
          {(control) => (
            <Input
              {...control}
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" disabled={submitting}>
          {submitting ? t("auth.signIn.submitting") : t("auth.signIn.submit")}
        </Button>
      </form>
      <div className="mt-4 flex justify-between text-sm font-semibold text-ink-soft">
        <Link to="/auth/signup">{t("auth.signIn.createAccount")}</Link>
        <Link to="/auth/reset-password">{t("auth.signIn.forgotPassword")}</Link>
      </div>
    </div>
  );
}

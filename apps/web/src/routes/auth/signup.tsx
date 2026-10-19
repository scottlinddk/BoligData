import { Link } from "react-router-dom";
import { useI18n } from "@/i18n/i18n";

/** BoligData is invite-only — accounts are created via an admin invitation, not self-service. */
export function SignUpPage() {
  const { t } = useI18n();

  return (
    <div className="mx-auto max-w-sm px-4 py-16 text-center">
      <h1 className="mb-2 text-3xl font-bold tracking-tight text-ink">{t("auth.signUp.inviteOnlyTitle")}</h1>
      <p className="font-medium text-ink-soft">{t("auth.signUp.inviteOnlyBody")}</p>
      <div className="mt-4 text-sm font-semibold text-ink-soft">
        <Link to="/auth/signin">{t("auth.signIn.title")}</Link>
      </div>
    </div>
  );
}

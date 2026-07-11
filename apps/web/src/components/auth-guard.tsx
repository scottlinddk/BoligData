import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n/i18n";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();

  if (loading) return <div className="p-8 text-center font-semibold text-ink-soft">{t("detail.loading")}</div>;
  if (!user) return <Navigate to="/auth/signin" replace />;
  return <>{children}</>;
}

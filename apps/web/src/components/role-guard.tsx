import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { UserRole } from "@shared/types/index";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useI18n } from "@/i18n/i18n";

export function RoleGuard({ allowed, children }: { allowed: UserRole[]; children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();
  const { t } = useI18n();

  if (authLoading || profileLoading) {
    return <div className="p-8 text-center font-semibold text-ink-soft">{t("detail.loading")}</div>;
  }
  if (!user) return <Navigate to="/auth/signin" replace />;
  if (!profile || !allowed.includes(profile.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

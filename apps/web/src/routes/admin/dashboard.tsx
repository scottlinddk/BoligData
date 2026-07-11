import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getAdminDashboard } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";

export function AdminDashboardPage() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "dashboard"], queryFn: getAdminDashboard });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-serif text-3xl italic text-ink">{t("admin.dashboard.title")}</h1>
        <div className="flex gap-2">
          <Link
            to="/admin/invitations"
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-hover"
          >
            {t("admin.dashboard.inviteUsers")}
          </Link>
          <Link
            to="/admin/users"
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-ink hover:bg-paper"
          >
            {t("admin.dashboard.manageUsers")}
          </Link>
        </div>
      </div>
      {isLoading && <p className="font-semibold text-ink-soft">{t("dashboard.loading")}</p>}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Link to="/admin/invitations">
            <StatCard label={t("admin.dashboard.pendingInvitations")} value={data.pendingInvitations} />
          </Link>
          <StatCard label={t("admin.dashboard.promotedListings")} value={data.promotedListings} />
          <StatCard label={t("admin.dashboard.recentApprovals")} value={data.recentApprovals} />
          {Object.entries(data.usersByRole).map(([role, count]) => (
            <StatCard key={role} label={t(`role.${role}` as TranslationKey)} value={count} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink-faint">{label}</div>
      <div className="mt-1 font-serif text-3xl italic text-ink">{value}</div>
    </div>
  );
}

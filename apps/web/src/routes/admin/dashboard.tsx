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
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t("admin.dashboard.title")}</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/invitations"
            className="rounded-full bg-cta px-3 py-1.5 text-sm font-bold text-cta-text transition hover:bg-cta-hover"
          >
            {t("admin.dashboard.inviteUsers")}
          </Link>
          <Link
            to="/admin/users"
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-ink hover:bg-paper"
          >
            {t("admin.dashboard.manageUsers")}
          </Link>
          <Link
            to="/admin/advisor-connections"
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-ink hover:bg-paper"
          >
            {t("admin.advisorConnections.title")}
          </Link>
        </div>
      </div>
      {isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-surface p-4">
              <div className="h-2.5 w-16 animate-pulse rounded bg-surface-alt" />
              <div className="mt-2 h-7 w-10 animate-pulse rounded bg-surface-alt" />
            </div>
          ))}
        </div>
      )}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 animate-fade-up">
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
      <div className="mt-1 text-3xl font-bold tracking-tight text-ink">{value}</div>
    </div>
  );
}

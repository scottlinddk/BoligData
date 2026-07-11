import { useQuery } from "@tanstack/react-query";
import { getAdminDashboard } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";

export function AdminDashboardPage() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "dashboard"], queryFn: getAdminDashboard });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 font-serif text-3xl italic text-ink">{t("admin.dashboard.title")}</h1>
      {isLoading && <p className="font-semibold text-ink-soft">{t("dashboard.loading")}</p>}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label={t("admin.dashboard.pendingInvitations")} value={data.pendingInvitations} />
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

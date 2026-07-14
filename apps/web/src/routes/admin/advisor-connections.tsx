import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAdvisorConnection,
  deleteAdvisorConnection,
  listAdminAdvisorConnections,
  listAdminUsers,
} from "@/lib/api";
import { useI18n } from "@/i18n/i18n";

export function AdminAdvisorConnectionsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [advisorId, setAdvisorId] = useState("");
  const [userId, setUserId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const usersQuery = useQuery({ queryKey: ["admin", "users"], queryFn: listAdminUsers });
  const connectionsQuery = useQuery({
    queryKey: ["admin", "advisor-connections"],
    queryFn: listAdminAdvisorConnections,
  });

  const connectMutation = useMutation({
    mutationFn: createAdvisorConnection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "advisor-connections"] }),
    onError: (err: Error) => setError(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: deleteAdvisorConnection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "advisor-connections"] }),
  });

  const users = usersQuery.data?.users ?? [];
  const professionals = users.filter((u) => u.role === "advisor" || u.role === "agent");
  const emailById = new Map(users.map((u) => [u.id, u.email]));
  const roleById = new Map(users.map((u) => [u.id, u.role]));
  const connections = connectionsQuery.data?.connections ?? [];

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!advisorId || !userId) return;
    connectMutation.mutate({ advisorId, userId });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-1 text-3xl font-bold tracking-tight text-ink">{t("admin.advisorConnections.title")}</h1>
      <p className="mb-4 text-sm font-semibold text-ink-soft">{t("admin.advisorConnections.hint")}</p>

      {professionals.length === 0 && !usersQuery.isLoading && (
        <p className="mb-4 rounded-xl border border-border bg-surface p-3 text-sm font-semibold text-ink-soft">
          {t("admin.advisorConnections.noProfessionals")}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap gap-2">
        <select
          value={advisorId}
          onChange={(e) => setAdvisorId(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-ink"
        >
          <option value="">{t("admin.advisorConnections.advisor")}</option>
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.email} ({t(p.role === "agent" ? "role.agent" : "role.advisor")})
            </option>
          ))}
        </select>
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-ink"
        >
          <option value="">{t("admin.advisorConnections.user")}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.email}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={connectMutation.isPending}
          className="rounded-full bg-cta px-3 py-2 font-bold text-cta-text transition hover:bg-cta-hover disabled:opacity-60"
        >
          {t("admin.advisorConnections.connect")}
        </button>
      </form>
      {error && <p className="mb-4 text-sm font-semibold text-danger">{error}</p>}

      {connections.length === 0 && (
        <p className="font-semibold text-ink-soft">{t("admin.advisorConnections.empty")}</p>
      )}
      <ul className="flex flex-col gap-2">
        {connections.map((c) => {
          const professionalRole = roleById.get(c.advisorId);
          return (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-3"
            >
              <div className="text-sm font-semibold text-ink">
                {emailById.get(c.advisorId) ?? c.advisorId}
                {professionalRole && (
                  <span className="ml-1.5 rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand">
                    {t(professionalRole === "agent" ? "role.agent" : "role.advisor")}
                  </span>
                )}
                <span className="mx-1.5 text-ink-soft">→</span>
                {emailById.get(c.userId) ?? c.userId}
              </div>
              <button
                onClick={() => removeMutation.mutate(c.id)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-bold text-ink"
              >
                {t("admin.advisorConnections.remove")}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

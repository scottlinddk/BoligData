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
  const advisors = users.filter((u) => u.role === "advisor");
  const emailById = new Map(users.map((u) => [u.id, u.email]));
  const connections = connectionsQuery.data?.connections ?? [];

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!advisorId || !userId) return;
    connectMutation.mutate({ advisorId, userId });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-3xl font-bold tracking-tight text-ink">{t("admin.advisorConnections.title")}</h1>

      <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap gap-2">
        <select
          value={advisorId}
          onChange={(e) => setAdvisorId(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-ink"
        >
          <option value="">{t("admin.advisorConnections.advisor")}</option>
          {advisors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.email}
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
          className="rounded-lg bg-brand px-3 py-2 font-bold text-white hover:bg-brand-hover"
        >
          {t("admin.advisorConnections.connect")}
        </button>
      </form>
      {error && <p className="mb-4 text-sm font-semibold text-danger">{error}</p>}

      {connections.length === 0 && (
        <p className="font-semibold text-ink-soft">{t("admin.advisorConnections.empty")}</p>
      )}
      <ul className="flex flex-col gap-2">
        {connections.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between rounded-xl border border-border bg-surface p-3"
          >
            <div className="text-sm font-semibold text-ink">
              {emailById.get(c.advisorId) ?? c.advisorId} → {emailById.get(c.userId) ?? c.userId}
            </div>
            <button
              onClick={() => removeMutation.mutate(c.id)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-bold text-ink"
            >
              {t("admin.advisorConnections.remove")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
